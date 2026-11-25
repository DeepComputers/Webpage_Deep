import os
import shutil

startup_dir = os.path.expandvars(r'%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup')

# 1. Clean up stray files
dummy_cfg = os.path.join(startup_dir, 'worker_config.json')
if os.path.isfile(dummy_cfg):
    try:
        os.remove(dummy_cfg)
        print("Removed stray worker_config.json from Startup folder.")
    except Exception as e:
        print(f"Error removing dummy config: {e}")

# 2. Update start.bat in Startup folder with the self-locating version
src_bat = r'D:\2\start.bat'
dst_bat = os.path.join(startup_dir, 'start.bat')
try:
    shutil.copy2(src_bat, dst_bat)
    print("Updated start.bat in Startup folder with self-locating directory finder.")
except Exception as e:
    print(f"Error copying start.bat: {e}")

# 3. Create Windows Shortcut (.lnk) using PowerShell COM
ps_script = f'''
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("{startup_dir}\\DeepComputersServer.lnk")
$Shortcut.TargetPath = "{src_bat}"
$Shortcut.WorkingDirectory = "D:\\2"
$Shortcut.Description = "Deep Computers & Telecom Permanent Store Server"
$Shortcut.Save()
'''
import subprocess
res = subprocess.run(["powershell", "-NoProfile", "-Command", ps_script], capture_output=True, text=True)
if res.returncode == 0:
    print("Created DeepComputersServer.lnk shortcut in Startup folder successfully.")
else:
    print(f"Shortcut creation notice: {res.stderr}")
