using System;
using System.Linq;
using BepInEx;
using BepInEx.Configuration;
using BepInEx.Logging;
using UnityEngine;

namespace WallEcho
{
    // Wall Echo: each time an orb bounces off a board wall, it echoes bonus damage
    // into the current shot (capped per shot). Ball Pit x Peglin crossover, step 1.
    //
    // The plugin does not reference Assembly-CSharp. It finds the orb type by name at
    // runtime and attaches a tracker component to each orb, so nothing breaks at build
    // time if Peglin's internals have a different shape than expected.
    [BepInPlugin(Guid, Name, Version)]
    public class WallEchoPlugin : BaseUnityPlugin
    {
        public const string Guid = "pdog47.peglin.wallecho";
        public const string Name = "Wall Echo";
        public const string Version = "0.1.0";

        internal static ManualLogSource Log;

        internal static ConfigEntry<bool> Enabled;
        internal static ConfigEntry<float> BonusPerEcho;
        internal static ConfigEntry<int> MaxEchoesPerShot;
        internal static ConfigEntry<string> BallTypeName;
        internal static ConfigEntry<string> WallHints;
        internal static ConfigEntry<string> DamageHookSpec;
        internal static ConfigEntry<bool> DiscoveryMode;

        private Type _ballType;
        private float _nextScan;
        private float _nextResolve;
        private bool _warnedNoBallType;

        private void Awake()
        {
            Log = Logger;

            Enabled = Config.Bind("General", "Enabled", true, "Turn Wall Echo on or off.");
            BonusPerEcho = Config.Bind("General", "BonusPerEcho", 1f, "Damage added to the shot for each wall echo.");
            MaxEchoesPerShot = Config.Bind("General", "MaxEchoesPerShot", 5, "Most wall echoes that count in one shot.");

            BallTypeName = Config.Bind("Hooks", "BallTypeName", "PachinkoBall",
                "Class name of the orb in Assembly-CSharp. Check the discovery file if orbs are never tracked.");
            WallHints = Config.Bind("Hooks", "WallHints", "wall,border,bound,edge",
                "Comma-separated words. A collider counts as a wall when its name, tag or layer contains one of them.");
            DamageHookSpec = Config.Bind("Hooks", "DamageHook", "",
                "Where echo damage goes, as TypeName.MemberName (a method taking one number, or a numeric field/property). " +
                "Leave empty to only count and flash echoes. Pick a value from the discovery file.");

            DiscoveryMode = Config.Bind("Debug", "DiscoveryMode", true,
                "Write BepInEx/WallEcho_discovery.txt with candidate damage members and log what orbs collide with.");

            if (DiscoveryMode.Value)
                Discovery.DumpCandidates();

            DamageHook.Resolve(DamageHookSpec.Value);
            Log.LogInfo($"{Name} {Version} loaded. Bonus {BonusPerEcho.Value} x up to {MaxEchoesPerShot.Value} per shot.");
        }

        private void Update()
        {
            if (!Enabled.Value)
                return;

            if (_ballType == null)
            {
                if (Time.unscaledTime < _nextResolve)
                    return;
                _nextResolve = Time.unscaledTime + 2f;
                _ballType = FindType(BallTypeName.Value);
                if (_ballType == null)
                {
                    if (!_warnedNoBallType)
                    {
                        Log.LogWarning($"Orb type '{BallTypeName.Value}' not found yet. Will keep looking.");
                        _warnedNoBallType = true;
                    }
                    return;
                }
                Log.LogInfo($"Tracking orbs of type {_ballType.FullName}.");
            }

            if (Time.unscaledTime < _nextScan)
                return;
            _nextScan = Time.unscaledTime + 0.1f;

            foreach (var obj in UnityEngine.Object.FindObjectsOfType(_ballType))
            {
                if (obj is Component c && c.GetComponent<EchoTracker>() == null)
                    c.gameObject.AddComponent<EchoTracker>();
            }
        }

        // Matches a simple name ("PachinkoBall") or a full name ("Namespace.PachinkoBall").
        internal static Type FindType(string name)
        {
            if (string.IsNullOrWhiteSpace(name))
                return null;
            name = name.Trim();
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type[] types;
                try { types = asm.GetTypes(); }
                catch (System.Reflection.ReflectionTypeLoadException e) { types = e.Types.Where(t => t != null).ToArray(); }
                catch { continue; }

                foreach (var t in types)
                {
                    if (t.FullName == name || t.Name == name)
                        return t;
                }
            }
            return null;
        }
    }
}
