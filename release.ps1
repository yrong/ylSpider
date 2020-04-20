webpack

$readme="yooli.html"
showdown makehtml -i README.md -o $readme -u UTF8 --tables
"<meta charset=""UTF-8"">" + (Get-Content $readme -Encoding UTF8) | Set-Content $readme -Encoding UTF8

$zipName="release.zip"
if (Test-Path $zipName) 
{
  Remove-Item $zipName
}

$compress = @{
  Path = "dist","public",".env.example","package.json","package-lock.json","install.bat","install.ps1", "ecosystem.config.js",$readme,"appreciate.jpg","analysis.png","detail.png"
  CompressionLevel = "Fastest"
  DestinationPath = $zipName
}
Compress-Archive @compress
