Set-Location 'e:\Edgeducate\Software\Resources\admin-desktop\build'
$sizes = 16,32,48,256
$pngBytes = @()
foreach ($s in $sizes) { $pngBytes += ,[IO.File]::ReadAllBytes("icon-$s.png") }

$ms = New-Object IO.MemoryStream
$bw = New-Object IO.BinaryWriter($ms)
$bw.Write([UInt16]0)
$bw.Write([UInt16]1)
$bw.Write([UInt16]$sizes.Count)

$headerSize = 6 + (16 * $sizes.Count)
$offset = $headerSize
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $s = $sizes[$i]
  $len = $pngBytes[$i].Length
  $wByte = if ($s -eq 256) { 0 } else { $s }
  $bw.Write([Byte]$wByte)
  $bw.Write([Byte]$wByte)
  $bw.Write([Byte]0)
  $bw.Write([Byte]0)
  $bw.Write([UInt16]1)
  $bw.Write([UInt16]32)
  $bw.Write([UInt32]$len)
  $bw.Write([UInt32]$offset)
  $offset += $len
}
for ($i = 0; $i -lt $sizes.Count; $i++) { $bw.Write($pngBytes[$i]) }
$bw.Flush()
[IO.File]::WriteAllBytes('..\edgeducate.ico', $ms.ToArray())
Write-Output 'ICO created'
