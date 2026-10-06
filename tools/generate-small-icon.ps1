$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$iconPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\src-tauri\icons\icon.ico'))
$source = [System.IO.File]::ReadAllBytes($iconPath)
$entryCount = [System.BitConverter]::ToUInt16($source, 4)
if ($entryCount -eq 0) { throw 'The application ICO has no images.' }

# Render the few main shapes on a large transparent canvas before reducing to 16 px.
$large = [System.Drawing.Bitmap]::new(128, 128, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
try {
    $graphics = [System.Drawing.Graphics]::FromImage($large)
    try {
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.ScaleTransform(8, 8)

        $background = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
            [System.Drawing.RectangleF]::new(0, 0, 16, 16),
            [System.Drawing.Color]::FromArgb(255, 76, 53, 106),
            [System.Drawing.Color]::FromArgb(255, 33, 29, 56),
            [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
        try {
            $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
            try {
                $path.AddArc(0, 0, 7, 7, 180, 90)
                $path.AddArc(9, 0, 7, 7, 270, 90)
                $path.AddArc(9, 9, 7, 7, 0, 90)
                $path.AddArc(0, 9, 7, 7, 90, 90)
                $path.CloseFigure()
                $graphics.FillPath($background, $path)
            } finally { $path.Dispose() }
        } finally { $background.Dispose() }

        $sun = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 255, 217, 120))
        try { $graphics.FillPie($sun, [single]5, [single]5, [single]6, [single]6, 180, 180) }
        finally { $sun.Dispose() }

        $rays = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 255, 214, 118), [single]0.95)
        try {
            $rays.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
            $rays.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
            $graphics.DrawLine($rays, [single]8, [single]2.5, [single]8, [single]3.8)
            $graphics.DrawLine($rays, [single]4.5, [single]4.8, [single]5.4, [single]5.7)
            $graphics.DrawLine($rays, [single]11.5, [single]4.8, [single]10.6, [single]5.7)
        } finally { $rays.Dispose() }

        $horizon = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 255, 242, 218), [single]1.15)
        try {
            $horizon.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
            $horizon.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
            $graphics.DrawLine($horizon, [single]2.2, [single]8.3, [single]13.8, [single]8.3)
        } finally { $horizon.Dispose() }

        $reflection = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 245, 182, 81), [single]0.9)
        try {
            $reflection.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
            $reflection.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
            $graphics.DrawLine($reflection, [single]5.2, [single]10.5, [single]10.8, [single]10.5)
            $graphics.DrawLine($reflection, [single]6.8, [single]12.2, [single]9.2, [single]12.2)
        } finally { $reflection.Dispose() }
    } finally { $graphics.Dispose() }

    $small = [System.Drawing.Bitmap]::new(16, 16, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $memory = [System.IO.MemoryStream]::new()
    try {
        $smallGraphics = [System.Drawing.Graphics]::FromImage($small)
        try {
            $smallGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $smallGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $smallGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $smallGraphics.DrawImage($large, 0, 0, 16, 16)
        } finally { $smallGraphics.Dispose() }
        $small.Save($memory, [System.Drawing.Imaging.ImageFormat]::Png)
        $smallPng = $memory.ToArray()
    } finally {
        $small.Dispose()
        $memory.Dispose()
    }
} finally { $large.Dispose() }

$pngBySize = [System.Collections.Generic.List[byte[]]]::new()
$imageEntries = [System.Collections.Generic.List[object]]::new()
$smallReplaced = $false
for ($index = 0; $index -lt $entryCount; $index++) {
    $headerOffset = 6 + 16 * $index
    $width = [int]$source[$headerOffset]
    $height = [int]$source[$headerOffset + 1]
    if ($width -eq 0) { $width = 256 }
    if ($height -eq 0) { $height = 256 }
    $byteCount = [System.BitConverter]::ToUInt32($source, $headerOffset + 8)
    $imageOffset = [System.BitConverter]::ToUInt32($source, $headerOffset + 12)

    if ($width -eq 16 -and $height -eq 16) {
        if ($smallReplaced) { throw 'The application ICO contains more than one 16x16 image.' }
        $pngBySize.Add([byte[]]$smallPng)
        $smallReplaced = $true
        $entry = [pscustomobject]@{ Width = 16; Height = 16; Planes = [uint16]1; Bits = [uint16]32 }
    } else {
        if ([uint64]$imageOffset + $byteCount -gt $source.Length) { throw 'An ICO image entry is outside the file.' }
        $imageBytes = [byte[]]::new([int]$byteCount)
        [Array]::Copy($source, [int]$imageOffset, $imageBytes, 0, [int]$byteCount)
        $pngBySize.Add($imageBytes)
        $entry = [pscustomobject]@{
            Width = [byte]$source[$headerOffset]
            Height = [byte]$source[$headerOffset + 1]
            Planes = [System.BitConverter]::ToUInt16($source, $headerOffset + 4)
            Bits = [System.BitConverter]::ToUInt16($source, $headerOffset + 6)
        }
    }
    $imageEntries.Add($entry)
}
if (-not $smallReplaced) { throw 'The application ICO has no 16x16 image to replace.' }

$output = [System.IO.MemoryStream]::new()
try {
    $writer = [System.IO.BinaryWriter]::new($output)
    try {
        $writer.Write([uint16]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]$entryCount)
        $nextOffset = 6 + 16 * $entryCount
        for ($index = 0; $index -lt $entryCount; $index++) {
            $entry = $imageEntries[$index]
            $bytes = $pngBySize[$index]
            $writer.Write([byte]$entry.Width)
            $writer.Write([byte]$entry.Height)
            $writer.Write([byte]0)
            $writer.Write([byte]0)
            $writer.Write([uint16]$entry.Planes)
            $writer.Write([uint16]$entry.Bits)
            $writer.Write([uint32]$bytes.Length)
            $writer.Write([uint32]$nextOffset)
            $nextOffset += $bytes.Length
        }
        foreach ($bytes in $pngBySize) { $writer.Write([byte[]]$bytes) }
        $writer.Flush()
        $result = $output.ToArray()
    } finally { $writer.Dispose() }
} finally { $output.Dispose() }

# Write beside the source, then replace it only after every ICO image was assembled.
$temporaryPath = "$iconPath.$PID.tmp"
try {
    [System.IO.File]::WriteAllBytes($temporaryPath, $result)
    Move-Item -LiteralPath $temporaryPath -Destination $iconPath -Force
} finally {
    if (Test-Path -LiteralPath $temporaryPath) { Remove-Item -LiteralPath $temporaryPath }
}
Write-Output "Replaced only the 16x16 Explorer icon in $iconPath."
