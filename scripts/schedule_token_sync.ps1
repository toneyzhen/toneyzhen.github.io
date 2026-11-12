# Registers a daily Windows Task Scheduler job that uploads Claude Code token totals
# to the site (scripts/token_usage.py --publish). Run once, in PowerShell:
#
#   powershell -ExecutionPolicy Bypass -File scripts\schedule_token_sync.ps1
#
# Needs Python 3 and the GitHub CLI signed in (gh auth login). Remove the job with:
#   Unregister-ScheduledTask -TaskName "Portfolio token sync" -Confirm:$false

$ErrorActionPreference = 'Stop'
$taskName = 'Portfolio token sync'
$script = Join-Path $PSScriptRoot 'token_usage.py'
$repoDir = Split-Path $PSScriptRoot -Parent

# Prefer the Python launcher (py), then python on PATH
$py = Get-Command py -ErrorAction SilentlyContinue
if ($py) {
    $exe = $py.Source
    $pyArgs = @('-3', $script, '--publish')
} else {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) { throw 'Python 3 was not found. Install it from python.org, then run this again.' }
    $exe = $python.Source
    $pyArgs = @($script, '--publish')
}
# Task Scheduler takes one argument string; quote the script path in case it has spaces
$arguments = ($pyArgs | ForEach-Object { if ($_ -match ' ') { "`"$_`"" } else { $_ } }) -join ' '

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'The GitHub CLI (gh) was not found. Install it from cli.github.com and run: gh auth login'
}

# Try it once now so any problem shows up here, not silently in the background
Write-Host 'Test run:'
& $exe @pyArgs
if ($LASTEXITCODE -ne 0) { throw 'The test run failed; fix the error above, then run this again.' }

$action = New-ScheduledTaskAction -Execute $exe -Argument $arguments -WorkingDirectory $repoDir
$trigger = New-ScheduledTaskTrigger -Daily -At '9:00 PM'
# StartWhenAvailable: if the computer was off at 9 PM, run as soon as it's back
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
    -Description 'Uploads weekly Claude Code token totals to toneyzhen.github.io (data/tokens.json).' -Force | Out-Null

Write-Host "Scheduled '$taskName' to run daily at 9:00 PM (or at next startup if missed)."
