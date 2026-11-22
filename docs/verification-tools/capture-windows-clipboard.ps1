# Run from a new STA Windows PowerShell process after copying the public test response.
# The raw captures belong outside the repository and may contain a provider URL.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$PrivateDirectory)
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Requires Windows.' }
if ([Threading.Thread]::CurrentThread.GetApartmentState() -ne 'STA') { throw 'Start PowerShell with -STA.' }
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..')).TrimEnd('\')
$target = [IO.Path]::GetFullPath($PrivateDirectory).TrimEnd('\')
if ($target -eq $root -or $target.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Choose a private folder outside the application tree.'
}
if (Test-Path $target) { throw 'Choose a new directory to preserve prior attempts.' }
Add-Type -AssemblyName System.Windows.Forms
$data = [Windows.Forms.Clipboard]::GetDataObject()
if ($null -eq $data) { throw 'Clipboard empty.' }
$formats = @($data.GetFormats($false))
$html = $data.GetData('HTML Format', $false)
$plain = $data.GetData('UnicodeText', $false)
if (-not ($html -is [string]) -or -not ($plain -is [string]) -or
    [string]::IsNullOrEmpty($html) -or [string]::IsNullOrEmpty($plain)) {
  throw 'Copy again from the provider. Both native HTML Format and UnicodeText are required.'
}
[void][IO.Directory]::CreateDirectory($target)
$utf8 = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $target 'native-html.txt'), $html, $utf8)
[IO.File]::WriteAllText((Join-Path $target 'native-plain.txt'), $plain, $utf8)
$start = Get-Content (Join-Path $root 'evidence/rc12/acceptance/start.json') -Raw | ConvertFrom-Json
$record = [ordered]@{
  method = 'Windows Forms IDataObject, without format auto-conversion'
  recordedUtc = [DateTime]::UtcNow.ToString('o')
  os = [Environment]::OSVersion.VersionString
  runId = $start.runId
  candidateSha256 = $start.identity.candidateSha256
  distTreeSha256 = $start.identity.distTreeSha256
  nativeFormats = $formats
  htmlTextUtf8Sha256 = (Get-FileHash (Join-Path $target 'native-html.txt')).Hash.ToLowerInvariant()
  plainTextUtf8Sha256 = (Get-FileHash (Join-Path $target 'native-plain.txt')).Hash.ToLowerInvariant()
}
[IO.File]::WriteAllText((Join-Path $target 'capture.json'), ($record | ConvertTo-Json -Depth 4), $utf8)
Write-Output "Captured both Windows clipboard formats in the selected private directory."
