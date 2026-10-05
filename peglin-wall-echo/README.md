# Wall Echo (Peglin mod)

The first passive for a Ball Pit x Peglin crossover. Each time an orb bounces off a board wall, it adds bonus damage to the shot. Echoes are capped per shot, and the orb flashes cyan on each one.

This is a BepInEx 5 plugin. It doesn't reference Peglin's code at build time. At runtime it finds the orb class by name and attaches a small tracker to each orb, so a game update can't stop it from building.

## Install

1. Install **BepInEx 5 (x64)** into your Peglin folder, then start Peglin once so BepInEx creates its folders.
2. Build the plugin (needs the .NET SDK):
   ```
   dotnet build -c Release -p:PeglinDir="C:\Program Files (x86)\Steam\steamapps\common\Peglin"
   ```
   If that folder exists, the build copies `WallEcho.dll` into `BepInEx\plugins\WallEcho\`. If it doesn't, copy `bin\Release\netstandard2.0\WallEcho.dll` there yourself.
3. Start Peglin and fire one shot that hits a side wall.

## First run: wire up the damage

Out of the box the plugin only **counts and flashes** echoes. It doesn't know where Peglin keeps shot damage yet. On the first run it writes:

- `BepInEx\WallEcho_discovery.txt`: the orb, battle and damage classes in Peglin, plus one line for each kind of thing the orb hit (name, tag, layer and `wall=YES/no`).
- The same collision lines in `BepInEx\LogOutput.log`, under `[Discovery]`.

Then:

1. Check that the side walls show `wall=YES` and the pegs show `wall=no`. If not, edit `WallHints`.
2. Pick the member that adds damage to the current shot, for example a method like `SomeBattleClass.AddDamage(Single amount)`. Put it in `DamageHook`.
3. Restart Peglin. Each echo should now log `+1 damage`.

## Config

Settings live in `BepInEx\config\pdog47.peglin.wallecho.cfg`:

| Setting | Default | What it does |
|---|---|---|
| `Enabled` | `true` | Turns the passive on or off. |
| `BonusPerEcho` | `1` | Damage added for each wall echo. |
| `MaxEchoesPerShot` | `5` | Most echoes that count in one shot. |
| `BallTypeName` | `PachinkoBall` | The orb class name. |
| `WallHints` | `wall,border,bound,edge` | A collider is a wall if its name, tag or layer contains one of these. |
| `DamageHook` | *(empty)* | `TypeName.MemberName`: a method that takes one number, or a numeric field or property to add to. |
| `DiscoveryMode` | `true` | Writes the discovery file and logs collisions. |
