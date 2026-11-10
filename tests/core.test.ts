import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  generateLua, importLua, validate, newProfile, newSet, newItem, newRule, newCond, uid, tokenizeLua, LuaSyntaxError, describeRule, normaliseProject,
} from '../src/core';

const SAMPLE = `
-- Header comment
local profile = {};

local sets = {
    Idle = {
        Main = 'Excalibur',
        Sub = "Genbu's Shield",
        Head = { Name = 'Walahra Turban', Augment = { 'HP+10', 'DEX+3' }, AugPath = 'A' },
        Ear1 = gFunc.Foo,
        Back = { Name = 'Cape', AugRank = 3, Bag = 'Wardrobe2' },
    },
    TP = { Head = 'Optical Hat', Body = 'Scorpion Harness', BaseSet = 'Idle' },
    Midcast = {
        Cure = { Hands = 'Bokwus Gloves' },
        Enfeebling = { Neck = 'Justice Torque' },
    },
    Empty = {},
};
profile.Sets = sets;
sets.Late = { Legs = 'Dusk Trousers' };
sets.Combo = gFunc.Combine(sets.Idle, sets.TP);

local TPMode = 'Normal';
local function helper(x) return x + 1 end

profile.OnLoad = function()
    gSettings.AllowAddSet = false;
    print('loaded');
end

profile.OnUnload = function() end

profile.HandleCommand = function(args)
    if (args[1] == 'tp') then
        TPMode = 'Acc';
    end
end

profile.HandleDefault = function()
    local player = gData.GetPlayer();
    local env = gData.GetEnvironment();
    gFunc.EquipSet(sets.Idle);
    -- Fight gear
    if (player.Status == 'Engaged') then
        gFunc.EquipSet(sets.TP);
        if (TPMode == 'Acc') then gFunc.Equip('Ring1', 'Rajas Ring'); end
    elseif (player.Status == 'Resting' and player.HPP < 80) then
        gFunc.EquipSet('Late');
    else
        gFunc.Message('idle');
    end
    if (env.DayElement == 'Fire' or (player.MPP <= 25 and gData.GetBuffCount('Haste') > 0)) then
        gFunc.EquipSet(sets.Midcast.Cure);
    end
    for i = 1, 3 do print(i) end
end

profile.HandleMidcast = function()
    local action = gData.GetAction();
    if (string.match(action.Name, 'Cure')) then
        gFunc.EquipSet(sets.Midcast.Cure);
    elseif (action.Skill == 'Enfeebling Magic') then
        gFunc.EquipSet(sets.Midcast.Enfeebling);
    elseif (TPMode == 'Acc' or action.Name == 'Haste') then
        gFunc.EquipSet(sets.Missing);
    end
end

function profile.HandleWeaponskill()
    gFunc.EquipSet(sets.TP);
end

return profile;
`;

test('imports sets, nesting and assignments', () => {
  const p = importLua(SAMPLE, { name: 'TST', job: 'WAR' });
  assert.deepEqual(p.sets.map(s => s.name), ['Idle', 'TP', 'Midcast.Cure', 'Midcast.Enfeebling', 'Empty', 'Late']);
  const idle = p.sets[0]!;
  assert.equal(idle.slots.Head?.augPath, 'A');
  assert.deepEqual(idle.slots.Head?.augments, ['HP+10', 'DEX+3']);
  assert.equal(idle.slots.Back?.augRank, 3);
  assert.equal(idle.slots.Back?.bag, 'Wardrobe2');
  assert.equal(idle.slots.Ear1?.raw, 'gFunc.Foo');
  assert.ok(p.raw.custom.includes('sets.Combo') && p.raw.custom.includes('helper') && p.raw.custom.includes('TPMode'));
});

test('imports settings and raw handlers', () => {
  const p = importLua(SAMPLE);
  assert.equal(p.settings.allowAddSet, false);
  assert.ok(p.raw.OnLoad.includes("print('loaded')") && !p.raw.OnLoad.includes('gSettings'));
  assert.ok(p.raw.HandleCommand.includes("args[1] == 'tp'"));
  assert.equal(p.names.environment, 'env');
});

test('imports rules, elseif chains and unknown checks', () => {
  const p = importLua(SAMPLE);
  const def = p.rules.filter(r => r.handler === 'HandleDefault');
  assert.equal(def.length, 6);
  assert.equal(def[def.length - 1]!.kind, 'raw');
  const mid = p.rules.filter(r => r.handler === 'HandleMidcast');
  assert.equal(mid.length, 3);
  assert.ok(mid[1]!.exclusive && mid[2]!.exclusive);
  const first = mid[0]!;
  assert.ok(first.kind === 'rule' && 'kind' in first.when.children[0]! && (first.when.children[0] as { op: string }).op === 'contains');
  const third = mid[2]!;
  assert.ok(third.kind === 'rule' && third.when.op === 'OR' && (third.when.children[0] as { kind: string }).kind === 'raw');
  const ws = p.rules.filter(r => r.handler === 'HandleWeaponskill');
  assert.equal(ws.length, 1);
  assert.ok(ws[0]!.kind === 'rule' && ws[0]!.actions[0]!.type === 'equipSet' && (ws[0]!.actions[0] as { setId: string }).setId);
});

test('generated Lua round-trips and is stable', () => {
  const p = importLua(SAMPLE, { name: 'TST', job: 'WAR' });
  const lua = generateLua(p);
  const p2 = importLua(lua, { name: 'TST', job: 'WAR' });
  assert.equal(p2.sets.length, p.sets.length);
  assert.equal(p2.rules.length, p.rules.length);
  assert.equal(generateLua(p2), lua);
  assert.ok(lua.includes("Back = { Name = 'Cape', AugRank = 3, Bag = 'Wardrobe2' }"));
});

test('validation flags a missing set', () => {
  const issues = validate(importLua(SAMPLE));
  assert.ok(issues.some(i => i.sev === 'error' && /Missing/.test(i.title)));
  assert.ok(issues.some(i => /"Empty" is empty/.test(i.title)));
});

test('builds a profile from scratch', () => {
  const q = newProfile('RDM', 'RDM');
  const idle = newSet('Idle'); idle.slots.Head = newItem("Kirin's Osode"); q.sets.push(idle);
  const tp = newSet('TP_Normal'); tp.slots.Main = newItem('Excalibur'); q.sets.push(tp);
  q.sets.push(newSet('TP_Acc'));
  q.variables.push({ id: 'v1', name: 'TPMode', options: ['Normal', 'Acc'], value: 'Normal' });
  q.commands.push({ id: 'c1', name: 'tpmode', kind: 'cycle', varId: 'v1' });
  const r1 = newRule('HandleDefault'); r1.actions.push({ type: 'equipSet', setId: idle.id }); q.rules.push(r1);
  const r2 = newRule('HandleDefault'); r2.when.children.push({ ...newCond('player.status'), value: 'Engaged' }); r2.actions.push({ type: 'equipSetVar', prefix: 'TP_', varId: 'v1' }); q.rules.push(r2);
  const r3 = newRule('HandleMidcast'); r3.when.children.push({ ...newCond('action.name'), op: 'oneof', value: 'Cure, Cure II' }); r3.actions.push({ type: 'message', text: "it's cure" }); q.rules.push(r3);
  const lua = generateLua(q);
  assert.ok(lua.includes("gFunc.EquipSet('TP_' .. TPMode);"));
  assert.ok(lua.includes("TPMode = CycleValue(TPModeOptions, TPMode);"));
  assert.ok(lua.includes(`gFunc.Message("it's cure");`));
  assert.ok(lua.includes("(action.Name == 'Cure' or action.Name == 'Cure II')"));
  assert.equal(describeRule(r2, q), 'If your status is Engaged: equip the set named "TP_" + TPMode.');
  assert.deepEqual(validate(q).filter(i => i.sev === 'error'), []);
});

test('syntax errors are reported, not thrown as crashes', () => {
  assert.throws(() => importLua("local x = 'abc"), LuaSyntaxError);
  assert.throws(() => importLua('profile.HandleDefault = function() if x then '), LuaSyntaxError);
});

test('highlighter keeps every character', () => {
  const src = "local a = 'x'; -- hi\nif (a == 1) then gFunc.EquipSet(sets.X); end";
  assert.equal(tokenizeLua(src).map(t => t.text).join(''), src);
});

test('project normalisation fills gaps and rejects junk', () => {
  assert.throws(() => normaliseProject({ nope: 1 }));
  const p = normaliseProject({ profiles: [{ name: 'A', sets: [{ id: 's', name: 'X' }] }] });
  assert.equal(p.profiles[0]!.sets[0]!.note, '');
  assert.ok(uid('x').startsWith('x_'));
});
