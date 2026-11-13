# Fixtures video tổng hợp

Không chứa dữ liệu người dùng. Tạo bằng FFmpeg build được pin tại `scripts/setup-video-tools.mjs`; 1 giây, màu xanh, 32×24, 10fps, không audio/metadata người dùng. Byte-level assertions so sánh file đã commit với upload/delivery, không phụ thuộc tái encode cho từng test.

```text
ffmpeg -v error -f lavfi -i color=c=blue:s=32x24:r=10 -t 1 -an -c:v libx264 -pix_fmt yuv420p -movflags +faststart -map_metadata -1 -y valid.mp4
ffmpeg -v error -f lavfi -i color=c=blue:s=32x24:r=10 -t 1 -an -c:v libvpx-vp9 -map_metadata -1 -y valid.webm
ffmpeg -v error -f lavfi -i color=c=blue:s=32x24:r=10 -f lavfi -i anullsrc=r=48000:cl=mono -t 1 -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart -map_metadata -1 -y with-audio.mp4
ffmpeg -v error -f lavfi -i color=c=blue:s=16x16:r=10 -t 180 -an -c:v libx264 -pix_fmt yuv420p -movflags +faststart -map_metadata -1 -y 180-seconds.mp4
ffmpeg -v error -f lavfi -i color=c=blue:s=16x16:r=10 -t 180.1 -an -c:v libx264 -pix_fmt yuv420p -movflags +faststart -map_metadata -1 -y over-duration.mp4
```

Validation tests tạo bản truncate/corrupt trong thư mục temp riêng. Test biên 100 MiB thêm atom `free` hợp lệ và sparse truncate trên bản copy; không commit fixture 100 MiB hoặc dùng file production.
