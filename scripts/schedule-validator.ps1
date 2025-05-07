$action = New-ScheduledTaskAction -Execute "node.exe" -Argument "scripts/validateProductReferences.js" -WorkingDirectory "C:\path\to\mvp\backend"
$trigger = New-ScheduledTaskTrigger -Daily -At 12am
$principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName "ProductValidator" -Action $action -Trigger $trigger -Principal $principal -Settings $settings