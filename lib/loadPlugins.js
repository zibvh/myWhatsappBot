const fs = require('fs');
const path = require('path');

/**
 * Each file in /plugins exports: { commands: [ { name, aliases, description,
 * category, ownerOnly, adminOnly, groupOnly, execute(ctx) }, ... ] }
 *
 * Returns a Map from command name/alias (lowercase) -> command object, plus
 * a flat array of all unique commands (for building the .menu / .help list).
 */
function loadPlugins() {
  const pluginsDir = path.join(__dirname, '..', 'plugins');
  const commandMap = new Map();
  const allCommands = [];
  const pluginModules = [];

  const files = fs.readdirSync(pluginsDir).filter((f) => f.endsWith('.js'));

  for (const file of files) {
    let plugin;
    try {
      plugin = require(path.join(pluginsDir, file));
    } catch (err) {
      console.error(`[plugins] Failed to load ${file}:`, err.message);
      continue;
    }
    pluginModules.push(plugin);

    const commands = plugin?.commands || [];
    for (const cmd of commands) {
      if (!cmd?.name || typeof cmd.execute !== 'function') {
        console.warn(`[plugins] Skipping invalid command in ${file}`);
        continue;
      }
      allCommands.push(cmd);
      const keys = [cmd.name, ...(cmd.aliases || [])];
      for (const key of keys) {
        const lower = key.toLowerCase();
        if (commandMap.has(lower)) {
          console.warn(`[plugins] Duplicate command name/alias "${lower}" (from ${file}) — keeping the first one loaded.`);
          continue;
        }
        commandMap.set(lower, cmd);
      }
    }
  }

  console.log(`[plugins] Loaded ${allCommands.length} commands from ${files.length} files.`);
  return { commandMap, allCommands, pluginModules };
}

module.exports = { loadPlugins };
