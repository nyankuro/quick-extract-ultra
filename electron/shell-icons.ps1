# Long-running helper: reads "size|path" lines on stdin and answers each with
# "OK|<base64 png>" or "ERR|<message>". Uses the same Windows Shell image factory
# as Explorer, so files get their real icon (or thumbnail) at large sizes.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class QeuShellIcon {
  [StructLayout(LayoutKind.Sequential)]
  struct SIZE { public int cx; public int cy; }

  [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItemImageFactory { [PreserveSig] int GetImage(SIZE size, int flags, out IntPtr phbm); }

  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string path, IntPtr pbc, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory item);

  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr hObject);

  public static string Png(string path, int size) {
    IShellItemImageFactory factory;
    SHCreateItemFromParsingName(path, IntPtr.Zero, typeof(IShellItemImageFactory).GUID, out factory);
    IntPtr hbitmap;
    // 0 = thumbnail when the file has one (photos, videos), otherwise its icon.
    int hr = factory.GetImage(new SIZE { cx = size, cy = size }, 0, out hbitmap);
    Marshal.ReleaseComObject(factory);
    if (hr != 0) throw new COMException("GetImage failed", hr);
    try {
      using (Bitmap source = Image.FromHbitmap(hbitmap)) {
        Rectangle rect = new Rectangle(0, 0, source.Width, source.Height);
        BitmapData data = source.LockBits(rect, ImageLockMode.ReadOnly, source.PixelFormat);
        try {
          // FromHbitmap drops the alpha channel; re-wrap the raw pixels as ARGB to keep it.
          using (Bitmap argb = new Bitmap(data.Width, data.Height, data.Stride, PixelFormat.Format32bppArgb, data.Scan0))
          using (MemoryStream stream = new MemoryStream()) {
            bool hasAlpha = false;
            for (int y = 0; y < argb.Height && !hasAlpha; y += 4)
              for (int x = 0; x < argb.Width && !hasAlpha; x += 4)
                if (argb.GetPixel(x, y).A > 0) hasAlpha = true;
            (hasAlpha ? argb : source).Save(stream, ImageFormat.Png);
            return Convert.ToBase64String(stream.ToArray());
          }
        } finally { source.UnlockBits(data); }
      }
    } finally { DeleteObject(hbitmap); }
  }
}
'@
[Console]::Out.WriteLine('READY')
[Console]::Out.Flush()
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $separator = $line.IndexOf('|')
  try {
    $size = [int]$line.Substring(0, $separator)
    [Console]::Out.WriteLine('OK|' + [QeuShellIcon]::Png($line.Substring($separator + 1), $size))
  } catch {
    [Console]::Out.WriteLine('ERR|' + ($_.Exception.Message -replace '[\r\n]', ' '))
  }
  [Console]::Out.Flush()
}
