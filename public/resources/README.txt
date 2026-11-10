Drop the Windower resource files here (from github.com/Windower/Resources, resources_data folder):

  items.lua          (required: all equipment)
  spells.lua         (optional: rule builder suggestions)
  job_abilities.lua  (optional)
  weapon_skills.lua  (optional)
  buffs.lua          (optional)

They are loaded automatically when the site opens, and the parsed result is cached in the browser until
the files change. Anyone can still load newer files by hand with the "Game data" button; those take
priority on that device until removed. Update these files whenever the game adds items.
