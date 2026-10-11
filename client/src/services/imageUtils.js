// Shrinks a photo and converts it to JPEG before upload.
// Phone photos are often 4-12 MB (and iPhones use HEIC, which the AI can't read);
// drawing onto a canvas converts any format the browser can display into a smaller JPEG.
export async function fileToJpegDataUrl(file, maxDimension = 2000, quality = 0.85) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () =>
        reject(new Error(`Couldn't open "${file.name}". Try taking a screenshot of it, or use a JPEG/PNG.`));
      i.src = url;
    });
    const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // transparent PNGs -> white background
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
