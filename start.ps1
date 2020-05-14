$startSearchService = Read-Host "start search service for analysis?(y/n)"
if ($startSearchService -eq 'y'){
	write-host "begin to start elasticsearch"

	$java_version="jdk-13"
	$elastic_version="7.3.2"
	function refreshJava {
		$JAVA_HOME="C:\Program Files\Java\$java_version"
		$env:JAVA_HOME=$JAVA_HOME
		$env:Path+=";$JAVA_HOME\bin"
		refreshenv
	}
	$running = Get-NetTCPConnection -State Listen | Where-Object {$_.LocalPort -eq "9200"}
	if ($running) {
		Write-Host "elasticsearch already running"
	}
	else {
		Write-Host "elasticsearch not running,start"
		refreshJava
		Start-Process -FilePath "elasticsearch-$elastic_version\bin\elasticsearch"
	}
}


