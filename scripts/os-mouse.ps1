param([string]$op, [int]$x, [int]$y, [int]$x2 = 0, [int]$y2 = 0)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class M {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[M]::SetProcessDPIAware() | Out-Null
$DOWN = 0x0002; $UP = 0x0004
if ($op -eq 'drag') {
  [M]::SetCursorPos($x, $y) | Out-Null; Start-Sleep -Milliseconds 150
  [M]::mouse_event($DOWN, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 120
  for ($i = 1; $i -le 12; $i++) {
    $cx = [int]($x + ($x2 - $x) * $i / 12); $cy = [int]($y + ($y2 - $y) * $i / 12)
    [M]::SetCursorPos($cx, $cy) | Out-Null; Start-Sleep -Milliseconds 30
  }
  Start-Sleep -Milliseconds 120
  [M]::mouse_event($UP, 0, 0, 0, [UIntPtr]::Zero)
}
if ($op -eq 'dbl') {
  [M]::SetCursorPos($x, $y) | Out-Null; Start-Sleep -Milliseconds 150
  [M]::mouse_event($DOWN, 0, 0, 0, [UIntPtr]::Zero); [M]::mouse_event($UP, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 60
  [M]::mouse_event($DOWN, 0, 0, 0, [UIntPtr]::Zero); [M]::mouse_event($UP, 0, 0, 0, [UIntPtr]::Zero)
}
