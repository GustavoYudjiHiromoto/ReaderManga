import React, { useState, useEffect } from 'react';
import { X, Check, Plus, Folder, FolderPlus, Tag, Bookmark } from 'lucide-react';
import { HistoryService } from '../services/history.js';
import { FavoriteManga, Manga } from '../types/manga.js';

interface CategorySelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  manga: {
    id: string;
    title: string;
    coverUrl?: string;
    sourceName?: string;
    sourceId?: string;
    rating?: number;
    authors?: string[];
    genres?: string[];
    status?: any;
  } | null;
}

export const CategorySelectionModal: React.FC<CategorySelectionModalProps> = ({
  isOpen,
  onClose,
  manga
}) => {
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [newCatName, setNewCatName] = useState('');
  const [showNewInput, setShowNewInput] = useState(false);

  useEffect(() => {
    if (!isOpen || !manga) return;
    const allCols = HistoryService.getCustomCollections();
    setCategories(allCols);

    const fav = HistoryService.getFavorites().find(f => f.mangaId === manga.id);
    setSelectedCategories(fav?.customCollections || []);
  }, [isOpen, manga]);

  if (!isOpen || !manga) return null;

  const handleToggle = (colName: string) => {
    setSelectedCategories(prev => {
      if (prev.includes(colName)) {
        return prev.filter(c => c !== colName);
      } else {
        return [...prev, colName];
      }
    });
  };

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    HistoryService.createCustomCollection(trimmed);
    const updated = HistoryService.getCustomCollections();
    setCategories(updated);
    if (!selectedCategories.includes(trimmed)) {
      setSelectedCategories(prev => [...prev, trimmed]);
    }
    setNewCatName('');
    setShowNewInput(false);
  };

  const handleSave = () => {
    // If manga isn't bookmarked yet, ensure it is added to favorites
    let fav = HistoryService.getFavorites().find(f => f.mangaId === manga.id);
    if (!fav) {
      HistoryService.toggleBookmark({
        mangaId: manga.id,
        title: manga.title,
        coverUrl: manga.coverUrl || '',
        sourceName: manga.sourceName,
        sourceId: manga.sourceId,
        rating: manga.rating,
        authors: manga.authors,
        genres: manga.genres,
        status: manga.status
      });
    }

    HistoryService.setMangaCollections(manga.id, selectedCategories);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl p-5 text-zinc-100 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400">
              <Folder className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Categorias</h3>
              <p className="text-[11px] text-zinc-400 truncate max-w-[200px]">{manga.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Categories Checkboxes List (Mihon-style) */}
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {categories.length === 0 ? (
            <div className="text-center py-6 text-zinc-500 text-xs">
              <Tag className="h-6 w-6 mx-auto mb-2 text-zinc-600" />
              <p>Nenhuma categoria criada ainda.</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">Ex: &ldquo;Romance&rdquo;, &ldquo;Fantasy&rdquo;, &ldquo;Both&rdquo;</p>
            </div>
          ) : (
            categories.map((cat) => {
              const isChecked = selectedCategories.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleToggle(cat)}
                  className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                    isChecked
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                      : 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Folder className={`h-3.5 w-3.5 ${isChecked ? 'text-rose-400' : 'text-zinc-500'}`} />
                    <span>{cat}</span>
                  </div>
                  <div
                    className={`w-4 h-4 rounded-md flex items-center justify-center border transition-colors ${
                      isChecked
                        ? 'bg-rose-500 border-rose-500 text-white'
                        : 'border-zinc-700 bg-zinc-900'
                    }`}
                  >
                    {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Add New Category Form */}
        {showNewInput ? (
          <form onSubmit={handleCreateCategory} className="flex items-center gap-2 pt-1">
            <input
              type="text"
              autoFocus
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Nome da categoria (ex: Romance)..."
              className="flex-1 px-3 py-1.5 bg-zinc-950 border border-zinc-700 focus:border-rose-500 rounded-lg text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-sm"
            >
              Criar
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNewInput(false);
                setNewCatName('');
              }}
              className="p-1.5 text-zinc-400 hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowNewInput(true)}
            className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 font-medium py-1 cursor-pointer transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Adicionar nova categoria</span>
          </button>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium cursor-pointer transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer shadow-md shadow-rose-950/50 transition-colors"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
};
