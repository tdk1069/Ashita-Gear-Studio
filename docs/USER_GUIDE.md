# Ashita Gear Studio: Player Guide

Ashita Gear Studio builds a **LuAshitacast profile** (the `.lua` file that swaps your gear in Final Fantasy XI) without you writing any code. You pick gear, describe *when* to wear it, and the app writes the Lua for you. Everything runs in your browser; nothing is uploaded.

This guide starts with the basics and builds up:

1. [The four tabs at a glance](#1-the-four-tabs-at-a-glance)
2. [Your first profile](#2-your-first-profile)
3. [Make a weaponskill set and use it](#3-make-a-weaponskill-set-and-use-it)
4. [Different sets for different weaponskills](#4-different-sets-for-different-weaponskills)
5. [Idle and fighting gear](#5-idle-and-fighting-gear)
6. [Getting the file into the game](#6-getting-the-file-into-the-game)
7. [Variables and commands (modes like TP/Acc)](#7-variables-and-commands-modes-like-tpacc)
8. [Elemental staff and obi for the right day and weather](#8-elemental-staff-and-obi-for-the-right-day-and-weather)
9. [Bringing in a profile you already have](#9-bringing-in-a-profile-you-already-have)
10. [Saving, undo and starting fresh](#10-saving-undo-and-starting-fresh)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. The four tabs at a glance

| Tab | What it is for |
|---|---|
| **Gear Sets** | A *set* is a named outfit (Idle, TP, WS, Fast Cast...). You build them here by clicking slots on the character "paper doll". |
| **Rules** | A *rule* says **when** a set is worn: "when I use a weaponskill, wear my WS set". |
| **Profile** | Profile name and job, **variables** (modes), **commands** you can type in game, and a box for any custom Lua. |
| **Lua & Checks** | The generated Lua, plus a list of problems the app has spotted (a rule with no set, a misspelt item...). **Look here before you export.** |

The idea in one sentence: **sets hold gear, rules decide when to wear which set.**

## 2. Your first profile

1. Click **New project** in the top bar to clear the example data (click it twice to confirm). You can undo this.
2. Use **+ Profile** to add a profile, pick your **job**, and choose a template: *Blank* if you want to build everything yourself, or one of the starter templates (melee, caster, hybrid) that creates common sets and rules for you to fill in.
3. Choose which profile you are editing from the dropdown in the top bar.

Pieces of gear come from a game item list. If the item search says "Only a small sample list is loaded", open **Game data** in the top bar and load the full list (see [Troubleshooting](#11-troubleshooting)).

## 3. Make a weaponskill set and use it

This is the simplest useful thing you can do. We will make a set called `WS_Default` and tell the profile to wear it whenever you use any weaponskill.

### Step 1: build the set

1. Go to the **Gear Sets** tab.
2. Click **+ New set** and name it `WS_Default`. Use letters, numbers and underscores, with no spaces.
3. Click a slot on the paper doll, for example **Neck**. A search box opens.
4. Type part of the item name and pick it from the list. Use the arrow keys and Enter if you prefer. The **max level** box hides gear above your level.
5. Repeat for each slot you want to change. **Leave a slot empty if you do not want that slot touched**: it will just keep whatever you are already wearing.

Tips for the picker:
- Earrings and rings search both slots (Ear1/Ear2, Ring1/Ring2).
- If you want an item that is not in the list (a new item, or one with augments), type its name and choose the **Use "..." as typed** row at the bottom. You can then add an **augment path** or augment text.
- A small "Not in game data" tag just means the name is not in the item list you loaded. It is information, not an error.

### Step 2: add the rule

1. Go to the **Rules** tab.
2. Along the top you will see a row of tabs for *when* rules run (Default, Precast, Midcast, Ability, **Weaponskill**...). Click **Weaponskill**.
3. Click **+ Add a rule**. Give it a name like `WS gear`.
4. Each rule card has a **When** column (conditions) and a **Then** column (what to do). Under **Then**, click **+ Action**, leave the type as **Equip a gear set**, and choose `WS_Default`.
5. Leave **When** empty. A rule with no conditions always applies (the card says so), so this will fire on every weaponskill.

That's it. Open **Lua & Checks** and you will see the rule written out in plain English on the Rules tab and as Lua there.

## 4. Different sets for different weaponskills

Say you want one set for Savage Blade and another for Chant du Cygne.

1. Make two sets: `WS_SavageBlade` and `WS_ChantDuCygne` (Gear Sets tab).
2. On the Rules tab, in the **Weaponskill** handler, make your first rule:
   - Click **+ Condition** and change the condition type to **Action name**.
   - Set the operator to **is** and type `Savage Blade`. (Or use **is one of** and list several: `Savage Blade, Sanguine Blade`.)
   - Action: **Equip a gear set** `WS_SavageBlade`.
3. Add a second rule for Chant du Cygne the same way.
4. Keep your original `WS_Default` rule **at the top**, with no conditions, as the fallback.

**Order matters.** Rules run from top to bottom, and *when two rules fill the same slot, the later one wins*. So the general rule at the top sets a base, and the specific rules below only override the slots they fill. If you would rather have a rule apply only when the one above it did not match, tick **Otherwise** on that rule. Use the ↑ and ↓ buttons to reorder.

**Switching a rule off** without deleting it: untick **On** on the rule.

### Using TP to pick the set

Some earrings (such as Moonshade-type earrings) are only worth wearing if the extra TP will matter. Add a condition **Your TP** → **is below** → `3000` to the rule that equips that set. Check what your gear actually does before copying this idea.

## 5. Idle and fighting gear

Weaponskills are only one trigger. The **Default** handler runs continuously while you are not performing an action, so that is where idle and fighting gear lives:

1. Make sets `Idle`, `TP` and optionally `Resting`.
2. In **Rules → Default**, add a rule with no conditions that equips `Idle`.
3. Add a rule below it with the condition **Your status** → **is** → `Engaged` that equips `TP`.
4. Add another with **Your status** → **is** → `Resting` that equips `Resting`.

The later rules override the earlier ones, so Idle is your base and TP and Resting only replace the slots they fill.

Other conditions you can combine: HP %, MP %, TP, sub job, main job level, status effects (for example "Haste is active"), whether you have a pet, zone name, and more. Use **+ Group** to build "this OR that" checks. A group has a button that toggles between **ALL of these** (every condition must be true) and **ANY of these** (one is enough). New groups start as ANY.

## 6. Getting the file into the game

1. Open the **Lua & Checks** tab. Fix anything marked as an error (use the **Show me** button to jump straight to it).
2. Click **Export Lua** (top bar). The file is named after your job, for example `WAR.lua`. If your browser adds `.txt` to the end, rename it.
3. Put it in your Ashita folder:
   `ashita/config/addons/luashitacast/<CharName>_<CharId>/`
4. In game, load or reload LuAshitacast (for example `/lac load` and `/lac reload`; see the LuAshitacast documentation for the exact commands your version supports).

The Profile tab has two settings worth knowing about: **Allow `/lac addset` in game** lets you add the gear you are currently wearing as a set from the game chat, and the backup option keeps a copy of your profile before that happens.

## 7. Variables and commands (modes like TP/Acc)

A **variable** is a mode you can switch in game, such as `TPMode` with the options `Normal` and `Acc`. Variables are for choices **you** make. (Day and weather are different; see the next section.)

### Create a mode

1. **Profile tab → Variables → + Variable.** Name it `TPMode` and set options `Normal, Acc`.
2. **Profile tab → Commands → + Command.** Name it `tpmode`, set what it does to **Cycle a variable**, and choose `TPMode`.
3. In game, type `/lac fwd tpmode` (or put it on a macro) to flip between modes.

### Make a rule follow the mode

There are two ways:

- **Condition:** in a rule, add the condition **Profile variable** → `TPMode` **is** `Acc`, then equip your accuracy set.
- **Set picked by a variable:** make sets named `TP_Normal` and `TP_Acc`, then in a rule use the action **Equip a set picked by a variable**, with prefix `TP_` and variable `TPMode`. The profile will wear `TP_` plus the current mode automatically. Add a new option to the variable and a matching set, and it just works.

## 8. Elemental staff and obi for the right day and weather

You may have expected this to use variables set at day change. **It does not need them.** LuAshitacast can look at the current day, weather and the spell being cast at the moment you cast it, and the app has conditions for all three. So you make a few sets and some rules, and the profile does the rest every cast.

You will use three conditions:

| Condition | What it checks |
|---|---|
| **Spell element** | The element of the spell you are casting (Fire, Ice, Wind, Earth, Thunder, Water, Light, Dark, or Non-Elemental) |
| **Day element** | Today's element (Thunder means lightning) |
| **Weather element** | The current weather element, or None |

### The idea

- **Elemental staff:** wear the staff that matches the **spell's element**. This has nothing to do with the day.
- **Obi:** an obi (for example Hachirin-no-Obi) only helps when the **day or the weather matches the spell's element**. So the rule is "spell element is Fire **and** (day is Fire **or** weather is Fire)".

### Build it for one element (Fire)

**Sets** (Gear Sets tab). Each only needs the one slot:

- `Staff_Fire` with **Main** = your Fire staff
- `Obi_Fire` with **Waist** = your obi

**Rules** (Rules tab → **Midcast**), below your normal nuking rule so they override it:

1. **Fire staff**
   - Condition: **Spell element** **is** `Fire`
   - Action: **Equip a gear set** `Staff_Fire`
2. **Fire obi**
   - Condition: **Spell element** **is** `Fire`
   - Click **+ Group** (it starts as **ANY of these**, which is what you want), and inside it set the first condition to **Day element** **is** `Fire`, then **+ Condition** and make it **Weather element** **is** `Fire`
   - Action: **Equip a gear set** `Obi_Fire`

Because the obi rule has the spell-element condition **and** an ANY group, it only fires when it will actually help.

### Do the other seven

Repeat for Ice, Wind, Earth, Thunder, Water, Light and Dark. Use **Duplicate** on a set and on a rule, then change the element values. If you use a single obi that works for every element, you can reuse the same item in each `Obi_` set. You need eight staff sets and eight obi sets because the app compares against fixed values rather than "spell element equals today's element".

Tips:
- Put these rules **below** your general nuke or healing rules, because the later rule wins on the same slot.
- If you cast from your Main/Sub for TP, remember a staff swap only lasts for the cast. LuAshitacast returns to your Default gear afterwards.
- Item names are shown in the picker. Pick the exact staff and obi you own.

### Optional: switch the obi off with a variable

If you want to be able to turn obi swapping off (say, because you are saving gil on enchantments or you are in a no-obi area), create a variable `Obi` with options `On, Off`, a command `obi` that cycles it, and add the condition **Profile variable** `Obi` **is** `On` to each obi rule. That is the place variables help with elemental gear. It is a convenience, not a requirement.

## 9. Bringing in a profile you already have

Click **Import Lua** and choose your existing `.lua` file (or paste it). The app reads sets and the common patterns of rules, and builds the visual version for you.

- Anything it cannot turn into visual rules is **kept, not thrown away**. It appears as a custom Lua block you can still reorder, and in the **Profile → Advanced: custom Lua** boxes.
- After importing, the **Lua & Checks** tab shows an **Import report** listing what was recognised and what was kept as custom code, with line numbers.
- If the file has a syntax error, the app tells you instead of guessing.

Always test an imported profile in game before relying on it.

## 10. Saving, undo and starting fresh

- **Autosave:** your work is saved in this browser automatically (the line under the tabs says so). It is **per browser and per device**, so use **Save project** to keep a file backup or move to another computer, and **Open project** to load it.
- **Undo / Redo:** the ↶ and ↷ buttons, or Ctrl+Z and Ctrl+Y.
- **New project:** wipes the current project (click twice). It can be undone straight after.
- **Game data:** the item list is loaded for everyone from the site's resources folder, and anyone can load newer files with the **Game data** button. Those take priority on that device until you remove them.

## 11. Troubleshooting

**The item search only shows a short sample list.**
Click **Game data** in the top bar. The text tells you what the site found. You can also load the Windower resource files yourself: `items.lua` (required), plus `spells.lua`, `job_abilities.lua`, `weapon_skills.lua` and `buffs.lua`.

**A piece of gear does not equip in game.**
Check the **Lua & Checks** tab first. Then check the item name against the one the game shows, and make sure the item is in a bag LuAshitacast can use (your inventory or wardrobes). For augmented gear, check the augment path or text you set.

**My rules seem to fire in the wrong order.**
Order matters: later rules win on the same slot. Look at the order on the Rules tab, move rules with ↑ and ↓, and consider ticking **Otherwise** if only one of two rules should ever apply.

**The staff or obi does not swap.**
Make sure the rules are in the **Midcast** handler, below your general rules, and that the condition values are right (the day element for lightning is `Thunder`). The Rules tab shows each rule in plain English, which makes mistakes easy to spot.

**I changed the profile but nothing changed in game.**
Export again, replace the file in the LuAshitacast folder, and reload the profile in game.

---

*Gear Studio generates standard LuAshitacast Lua. If you ever want to go further, everything it writes is plain Lua you can read, and the custom Lua boxes let you add your own code without the app touching it.*


## Troubleshooting: item names

If an item does not swap in game, the name may not match what LuAshitacast expects. In the item picker, use the "Write item names as" choice to switch between the in-game short name (for example "Errant Hpl.") and the full name ("Errant Houppelande"), then pick the item again.
