using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using BepInEx;
using UnityEngine;

namespace WallEcho
{
    // Helps pick config values without decompiling the game: lists likely orb and
    // damage members, and logs what orbs actually collide with.
    internal static class Discovery
    {
        private const int MaxCollisionLogs = 40;
        private static readonly string[] TypeHints = { "Ball", "Pachinko", "Orb", "Battle", "Damage", "Attack" };
        private static readonly string[] MemberHints = { "Damage", "Dmg" };
        private static readonly HashSet<string> SeenCollisions = new HashSet<string>();

        private static string FilePath => Path.Combine(Paths.BepInExRootPath, "WallEcho_discovery.txt");

        public static void DumpCandidates()
        {
            try
            {
                var asm = AppDomain.CurrentDomain.GetAssemblies().FirstOrDefault(a => a.GetName().Name == "Assembly-CSharp");
                var sb = new StringBuilder();
                sb.AppendLine($"Wall Echo discovery, {DateTime.Now:yyyy-MM-dd HH:mm}");
                sb.AppendLine("Copy a TypeName.MemberName line into [Hooks] DamageHook in BepInEx/config/" + WallEchoPlugin.Guid + ".cfg");
                sb.AppendLine();

                if (asm == null)
                {
                    sb.AppendLine("Assembly-CSharp was not loaded when the plugin started.");
                }
                else
                {
                    Type[] types;
                    try { types = asm.GetTypes(); }
                    catch (ReflectionTypeLoadException e) { types = e.Types.Where(t => t != null).ToArray(); }

                    const BindingFlags flags = BindingFlags.Public | BindingFlags.NonPublic |
                                               BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;

                    foreach (var t in types.Where(t => HasAny(t.Name, TypeHints)).OrderBy(t => t.FullName))
                    {
                        var lines = new List<string>();
                        foreach (var m in t.GetMethods(flags).Where(m => HasAny(m.Name, MemberHints)))
                        {
                            var ps = string.Join(", ", m.GetParameters().Select(p => $"{p.ParameterType.Name} {p.Name}"));
                            lines.Add($"  method   {t.FullName}.{m.Name}({ps}){(m.IsStatic ? " [static]" : "")}");
                        }
                        foreach (var f in t.GetFields(flags).Where(f => HasAny(f.Name, MemberHints)))
                            lines.Add($"  field    {t.FullName}.{f.Name} : {f.FieldType.Name}");
                        foreach (var p in t.GetProperties(flags).Where(p => HasAny(p.Name, MemberHints)))
                            lines.Add($"  property {t.FullName}.{p.Name} : {p.PropertyType.Name}");

                        bool isComponent = typeof(Component).IsAssignableFrom(t);
                        if (lines.Count == 0 && !isComponent)
                            continue;

                        sb.AppendLine($"{t.FullName}{(isComponent ? "  (Unity component)" : "")}");
                        foreach (var l in lines)
                            sb.AppendLine(l);
                    }
                }

                File.WriteAllText(FilePath, sb.ToString());
                WallEchoPlugin.Log.LogInfo($"Discovery written to {FilePath}");
            }
            catch (Exception e)
            {
                WallEchoPlugin.Log.LogWarning($"Discovery dump failed: {e.Message}");
            }
        }

        public static void LogCollision(Collider2D other, bool isWall)
        {
            if (SeenCollisions.Count >= MaxCollisionLogs)
                return;

            string tag = WallClassifier.SafeTag(other);
            string layer = LayerMask.LayerToName(other.gameObject.layer);
            string key = $"{other.name}|{tag}|{layer}";
            if (!SeenCollisions.Add(key))
                return;

            var comps = string.Join(", ", other.GetComponents<Component>().Where(c => c != null).Select(c => c.GetType().Name));
            string line = $"orb hit '{other.name}' tag={tag} layer={layer} wall={(isWall ? "YES" : "no")} components=[{comps}]";
            WallEchoPlugin.Log.LogInfo("[Discovery] " + line);
            try { File.AppendAllText(FilePath, line + Environment.NewLine); }
            catch { }
        }

        private static bool HasAny(string s, string[] hints) =>
            hints.Any(h => s.IndexOf(h, StringComparison.OrdinalIgnoreCase) >= 0);
    }
}
