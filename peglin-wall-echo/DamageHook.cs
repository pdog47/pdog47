using System;
using System.Linq;
using System.Reflection;
using UnityEngine;

namespace WallEcho
{
    // Sends echo damage to a game member named in config ("TypeName.MemberName").
    // Supports a method taking one number, or a numeric field/property to add to.
    internal static class DamageHook
    {
        private const BindingFlags All =
            BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static;

        private static Type _type;
        private static MethodInfo _method;
        private static FieldInfo _field;
        private static PropertyInfo _property;
        private static bool _reportedFailure;

        public static bool IsSet => _type != null;

        public static void Resolve(string spec)
        {
            _type = null; _method = null; _field = null; _property = null;
            if (string.IsNullOrWhiteSpace(spec))
                return;

            int dot = spec.LastIndexOf('.');
            if (dot <= 0 || dot == spec.Length - 1)
            {
                WallEchoPlugin.Log.LogWarning($"DamageHook '{spec}' should look like TypeName.MemberName.");
                return;
            }

            string typeName = spec.Substring(0, dot).Trim();
            string member = spec.Substring(dot + 1).Trim();
            var type = WallEchoPlugin.FindType(typeName);
            if (type == null)
            {
                WallEchoPlugin.Log.LogWarning($"DamageHook type '{typeName}' not found.");
                return;
            }

            _method = type.GetMethods(All).FirstOrDefault(m =>
                m.Name == member && m.GetParameters().Length == 1 && IsNumeric(m.GetParameters()[0].ParameterType));
            if (_method == null)
            {
                _field = type.GetField(member, All);
                if (_field != null && !IsNumeric(_field.FieldType))
                    _field = null;
            }
            if (_method == null && _field == null)
            {
                _property = type.GetProperty(member, All);
                if (_property != null && (!IsNumeric(_property.PropertyType) || !_property.CanRead || !_property.CanWrite))
                    _property = null;
            }

            if (_method == null && _field == null && _property == null)
            {
                WallEchoPlugin.Log.LogWarning(
                    $"DamageHook '{spec}': no method with one numeric parameter, and no writable numeric field or property, by that name.");
                return;
            }

            _type = type;
            WallEchoPlugin.Log.LogInfo($"DamageHook bound to {type.FullName}.{member}.");
        }

        public static bool Apply(float amount)
        {
            if (_type == null)
                return false;

            try
            {
                bool isStatic = _method?.IsStatic ?? _field?.IsStatic ?? _property.GetGetMethod(true).IsStatic;
                object target = null;
                if (!isStatic)
                {
                    if (!typeof(UnityEngine.Object).IsAssignableFrom(_type))
                        throw new InvalidOperationException($"{_type.Name} is not a Unity object, so there is no live instance to find.");
                    target = UnityEngine.Object.FindObjectOfType(_type);
                    if (target == null)
                        throw new InvalidOperationException($"No live {_type.Name} in the scene.");
                }

                if (_method != null)
                {
                    var p = _method.GetParameters()[0].ParameterType;
                    _method.Invoke(target, new[] { Convert(amount, p) });
                }
                else if (_field != null)
                {
                    var current = System.Convert.ToDouble(_field.GetValue(target));
                    _field.SetValue(target, Convert(current + amount, _field.FieldType));
                }
                else
                {
                    var current = System.Convert.ToDouble(_property.GetValue(target, null));
                    _property.SetValue(target, Convert(current + amount, _property.PropertyType), null);
                }
                return true;
            }
            catch (Exception e)
            {
                if (!_reportedFailure)
                {
                    WallEchoPlugin.Log.LogError($"DamageHook failed: {(e as TargetInvocationException)?.InnerException ?? e}");
                    _reportedFailure = true;
                }
                return false;
            }
        }

        private static bool IsNumeric(Type t) =>
            t == typeof(int) || t == typeof(float) || t == typeof(double) || t == typeof(long);

        private static object Convert(double value, Type t)
        {
            if (t == typeof(int)) return (int)Math.Round(value);
            if (t == typeof(long)) return (long)Math.Round(value);
            if (t == typeof(float)) return (float)value;
            return value;
        }
    }
}
