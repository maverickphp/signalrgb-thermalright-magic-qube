Thermalright Magic Qube helper for SignalRGB
=============================================

Shows live CPU/GPU temperature and load on the Magic Qube's pump display, in the colors of your
SignalRGB effect.

Install
  1. Double-click Install.cmd and allow the admin prompt.
  2. In SignalRGB, open Addons and add:
     https://github.com/maverickphp/signalrgb-thermalright-magic-qube
  3. Quit SignalRGB from the tray icon and open it again.

The installer stops Thermalright Control Center (TRCC) from starting with Windows, since both
cannot drive the display at once. The helper runs hidden in the background; its log is in
%LOCALAPPDATA%\MagicQubeHelper\helper.log.

Uninstall
  Double-click Uninstall.cmd.

Licenses
  This helper: GPL-3.0 (LICENSE.txt).
  Includes LibreHardwareMonitorLib, MPL-2.0 (LibreHardwareMonitor-LICENSE.txt),
  https://github.com/LibreHardwareMonitor/LibreHardwareMonitor
