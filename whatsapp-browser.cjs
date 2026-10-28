'use strict';
const {execFile}=require('child_process');
// Never kill Chrome/Edge by image name. Only this clinic's exact executable
// AND dedicated WhatsApp user-data-dir qualify; normal browser tabs survive.
const RECOVER_SCRIPT = `
$ErrorActionPreference = 'Stop'
$profilePath = [IO.Path]::GetFullPath($env:BALAJI_WA_PROFILE).TrimEnd('\\')
$exePath = [IO.Path]::GetFullPath($env:BALAJI_WA_EXECUTABLE)
$count = 0
Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe' OR Name = 'msedge.exe'" | ForEach-Object {
  if ($_.ExecutablePath -and [string]::Equals($_.ExecutablePath, $exePath, [StringComparison]::OrdinalIgnoreCase)) {
    $match = [regex]::Match([string]$_.CommandLine, '(?:^|\\s)(?:"--user-data-dir(?:=|\\s+)([^"]+)"|--user-data-dir(?:=|\\s+)(?:"([^"]+)"|([^\\s"]+)))')
    if ($match.Success) {
      $dir = if ($match.Groups[1].Success) { $match.Groups[1].Value } elseif ($match.Groups[2].Success) { $match.Groups[2].Value } else { $match.Groups[3].Value }
      if ([string]::Equals([IO.Path]::GetFullPath($dir).TrimEnd('\\'), $profilePath, [StringComparison]::OrdinalIgnoreCase)) {
        Stop-Process -Id $_.ProcessId -Force -PassThru -ErrorAction Stop | Wait-Process -Timeout 3 -ErrorAction SilentlyContinue
        $count++
      }
    }
  }
}
Write-Output $count
`;
function recoverWhatsAppBrowser({profile,executablePath,platform=process.platform,run=execFile}) {
  if(platform!=='win32')return Promise.resolve(0);
  return new Promise((resolve,reject)=>run('powershell.exe',['-NoProfile','-NonInteractive','-Command',RECOVER_SCRIPT],
    {windowsHide:true,timeout:8000,env:{...process.env,BALAJI_WA_PROFILE:profile,BALAJI_WA_EXECUTABLE:executablePath}},
    (error,stdout)=>error?reject(error):resolve(Number(String(stdout).trim())||0)));
}
module.exports={recoverWhatsAppBrowser};
