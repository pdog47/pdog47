using System;
using System.Collections;
using UnityEngine;

namespace WallEcho
{
    // Added to each orb. Unity sends collision messages to every component on the
    // orb's GameObject, so this sees wall bounces without patching the orb class.
    public class EchoTracker : MonoBehaviour
    {
        private const float Debounce = 0.05f;
        private static readonly Color EchoColor = new Color(0.45f, 0.9f, 1f);

        private int _echoes;
        private float _lastEchoTime = -1f;
        private SpriteRenderer _sprite;
        private Coroutine _flash;

        // Orbs may be pooled and re-enabled per shot, so the count resets here.
        private void OnEnable()
        {
            _echoes = 0;
            _lastEchoTime = -1f;
        }

        private void OnCollisionEnter2D(Collision2D collision)
        {
            var other = collision.collider;
            if (other == null)
                return;

            bool isWall = WallClassifier.IsWall(other);
            if (WallEchoPlugin.DiscoveryMode.Value)
                Discovery.LogCollision(other, isWall);

            if (!isWall || !WallEchoPlugin.Enabled.Value)
                return;
            if (_echoes >= WallEchoPlugin.MaxEchoesPerShot.Value)
                return;
            // One bounce can report several contacts in quick succession.
            if (Time.time - _lastEchoTime < Debounce)
                return;

            _echoes++;
            _lastEchoTime = Time.time;

            float bonus = WallEchoPlugin.BonusPerEcho.Value;
            bool applied = DamageHook.Apply(bonus);
            WallEchoPlugin.Log.LogInfo(
                $"Wall Echo {_echoes}/{WallEchoPlugin.MaxEchoesPerShot.Value} off '{other.name}'" +
                (applied ? $": +{bonus} damage" : " (no DamageHook set, count only)"));

            Flash();
        }

        private void Flash()
        {
            if (_sprite == null)
                _sprite = GetComponentInChildren<SpriteRenderer>();
            if (_sprite == null)
                return;
            if (_flash != null)
                StopCoroutine(_flash);
            _flash = StartCoroutine(FlashRoutine(_sprite));
        }

        private IEnumerator FlashRoutine(SpriteRenderer sprite)
        {
            var original = sprite.color;
            sprite.color = EchoColor;
            yield return new WaitForSeconds(0.12f);
            if (sprite != null)
                sprite.color = original;
            _flash = null;
        }
    }

    internal static class WallClassifier
    {
        public static bool IsWall(Collider2D other)
        {
            // Pegs are never walls, whatever they are named.
            foreach (var comp in other.GetComponents<Component>())
            {
                if (comp != null && comp.GetType().Name.IndexOf("Peg", StringComparison.OrdinalIgnoreCase) >= 0)
                    return false;
            }

            string name = other.name;
            string tag = SafeTag(other);
            string layer = LayerMask.LayerToName(other.gameObject.layer);

            foreach (var raw in WallEchoPlugin.WallHints.Value.Split(','))
            {
                var hint = raw.Trim();
                if (hint.Length == 0)
                    continue;
                if (Contains(name, hint) || Contains(tag, hint) || Contains(layer, hint))
                    return true;
            }
            return false;
        }

        internal static string SafeTag(Component c)
        {
            try { return c.tag; }
            catch { return ""; }
        }

        private static bool Contains(string s, string hint) =>
            !string.IsNullOrEmpty(s) && s.IndexOf(hint, StringComparison.OrdinalIgnoreCase) >= 0;
    }
}
