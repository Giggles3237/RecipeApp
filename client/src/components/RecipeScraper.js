import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseRecipeWithAI, scrapeRecipe, importRecipeFromPhotos } from '../services/api';
import { fileToJpegDataUrl } from '../services/imageUtils';
import RecipeConfirmationDialog from './RecipeConfirmationDialog';

const MAX_PHOTOS = 4;

export default function RecipeScraper() {
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState([]); // [{ name, dataUrl }]
  const [loading, setLoading] = useState(null); // 'photo' | 'url' | 'text' | null
  const [error, setError] = useState('');
  const [useAI, setUseAI] = useState(false);
  const [scrapedRecipe, setScrapedRecipe] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const fileInput = useRef(null);
  const navigate = useNavigate();

  async function run(kind, fn) {
    setLoading(kind);
    setError('');
    try {
      const recipe = await fn();
      setScrapedRecipe(recipe);
      setShowConfirmation(true);
    } catch (err) {
      console.error(`${kind} import error:`, err);
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(null);
    }
  }

  async function handlePhotoPick(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setError('');
    try {
      const room = MAX_PHOTOS - photos.length;
      const converted = await Promise.all(
        files.slice(0, room).map(async (f) => ({ name: f.name, dataUrl: await fileToJpegDataUrl(f) }))
      );
      setPhotos((prev) => [...prev, ...converted]);
      if (files.length > room) setError(`Only ${MAX_PHOTOS} photos per recipe.`);
    } catch (err) {
      setError(err.message);
    }
  }

  const handlePhotoImport = (e) => {
    e.preventDefault();
    if (!photos.length) return;
    run('photo', () => importRecipeFromPhotos(photos.map((p) => p.dataUrl)));
  };

  const handleScrape = (e) => {
    e.preventDefault();
    if (!url) return;
    run('url', () => scrapeRecipe(url, useAI));
  };

  const handleText = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    run('text', () => parseRecipeWithAI(text));
  };

  const handleConfirmRecipe = (saved) => {
    setShowConfirmation(false);
    setScrapedRecipe(null);
    setUrl('');
    setText('');
    setPhotos([]);
    navigate(saved && saved.id ? `/recipe/${saved.id}` : '/');
  };

  const handleCloseConfirmation = () => {
    setShowConfirmation(false);
    setScrapedRecipe(null);
  };

  const busy = Boolean(loading);

  return (
    <div className="import-page">
      <h2>Import Recipe</h2>
      <p className="import-intro">
        Add a recipe from a photo, a web link, or pasted text. AI reads it, then checks every ingredient
        against the ones you already have so names and units stay consistent. You review everything before it's saved.
      </p>

      {error && <div className="import-error" role="alert">{error}</div>}

      <div className="import-section">
        <form onSubmit={handlePhotoImport} className="import-form">
          <h3>📷 From a photo</h3>
          <p className="hint">Cookbook page, recipe card (even handwritten), or a screenshot. Up to {MAX_PHOTOS} photos for multi-page recipes.</p>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            onChange={handlePhotoPick}
            style={{ display: 'none' }}
          />
          <div className="photo-strip">
            {photos.map((p, i) => (
              <div key={i} className="photo-thumb">
                <img src={p.dataUrl} alt={`Recipe page ${i + 1}`} />
                <button
                  type="button"
                  className="photo-remove"
                  aria-label="Remove photo"
                  onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button type="button" className="photo-add" onClick={() => fileInput.current.click()} disabled={busy}>
                {photos.length ? '+ Add page' : 'Take or choose photo'}
              </button>
            )}
          </div>
          <button type="submit" disabled={busy || !photos.length}>
            {loading === 'photo' ? 'Reading photo…' : 'Read recipe from photo'}
          </button>
        </form>

        <hr />

        <form onSubmit={handleScrape} className="import-form">
          <h3>🔗 From a web link</h3>
          <label>
            Recipe URL
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/recipe" />
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} />
            Have AI read the whole page (use if the normal import misses things)
          </label>
          <button type="submit" disabled={busy || !url}>
            {loading === 'url' ? 'Importing…' : 'Import from link'}
          </button>
        </form>

        <hr />

        <form onSubmit={handleText} className="import-form">
          <h3>📝 From pasted text</h3>
          <label>
            Recipe text
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="Paste the title, ingredients and steps" />
          </label>
          <button type="submit" disabled={busy || !text.trim()}>
            {loading === 'text' ? 'Reading…' : 'Read recipe text'}
          </button>
        </form>
      </div>

      <RecipeConfirmationDialog
        recipe={scrapedRecipe}
        isOpen={showConfirmation}
        onClose={handleCloseConfirmation}
        onConfirm={handleConfirmRecipe}
      />

      <style>{`
        .import-intro { color: #4b5563; max-width: 640px; }
        .import-error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; padding: 10px 14px; border-radius: 8px; margin: 12px 0; }
        .import-form h3 { margin: 0 0 4px; }
        .import-form .hint { color: #6b7280; font-size: 0.9rem; margin: 0 0 10px; }
        .import-form label { display: block; }
        .import-form input[type=url], .import-form textarea { display: block; width: 100%; box-sizing: border-box; margin-top: 6px; padding: 10px; font-size: 16px; border: 1px solid #d1d5db; border-radius: 8px; font-family: inherit; }
        .import-form button[type=submit] { margin-top: 12px; padding: 10px 16px; font-size: 1rem; }
        .import-section hr { margin: 24px 0; border: none; border-top: 1px solid #e5e7eb; }
        .import-form .checkbox-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
        .photo-strip { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
        .photo-thumb { position: relative; width: 96px; height: 120px; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb; }
        .photo-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .photo-remove { position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; padding: 0; border-radius: 50%; border: none; background: rgba(0,0,0,0.6); color: #fff; cursor: pointer; line-height: 24px; }
        .photo-add { width: 96px; height: 120px; border: 2px dashed #9ca3af; border-radius: 8px; background: #f9fafb; color: #374151; cursor: pointer; font-size: 0.85rem; padding: 6px; }
      `}</style>
    </div>
  );
}
