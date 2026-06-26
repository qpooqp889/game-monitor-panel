Add-Type -AssemblyName System.Drawing

function Create-Icon($size, $path) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::FromArgb(26, 26, 46))
    
    $margin = [int]($size * 0.08)
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(15, 52, 96))
    $g.FillEllipse($brush, $margin, $margin, $size - $margin * 2, $size - $margin * 2)
    
    $fontSize = [int]($size * 0.4)
    $font = New-Object System.Drawing.Font('Arial', $fontSize, [System.Drawing.FontStyle]::Bold)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    $g.DrawString('G', $font, [System.Drawing.Brushes]::Cyan, $rect, $sf)
    
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Created: $path"
}

$iconDir = 'C:\Users\steve\.qclaw\workspace\game-monitor-extension\icons'
Create-Icon 16 "$iconDir\icon16.png"
Create-Icon 48 "$iconDir\icon48.png"
Create-Icon 128 "$iconDir\icon128.png"
Write-Host 'All icons created!'
