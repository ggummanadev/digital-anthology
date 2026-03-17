import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'motion/react';
import { Trash2, GripVertical, Edit3, Image as ImageIcon } from 'lucide-react';
import { Poem } from '../types';

interface SortablePoemItemProps {
  key?: string | number;
  poem: Poem;
  onRemove: (id: string) => void;
  onEdit: (poem: Poem) => void;
}

export function SortablePoemItem({ poem, onRemove, onEdit }: SortablePoemItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: poem.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 md:gap-6 p-3 md:p-5 transition-all border border-stone-200 rounded-2xl bg-white group hover:border-stone-400 hover:shadow-md ${
        isDragging ? 'opacity-50 border-stone-400 shadow-xl scale-105' : ''
      }`}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-stone-300 hover:text-stone-500 transition-colors">
        <GripVertical className="w-4 h-4 md:w-5 md:h-5" />
      </div>
      
      <div className="relative w-14 h-14 md:w-20 md:h-20 overflow-hidden rounded-xl bg-stone-50 shrink-0 border border-stone-100">
        {poem.imageUrl ? (
          <img src={poem.imageUrl} alt={poem.title} className="object-cover w-full h-full" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-200">
            <ImageIcon className="w-6 h-6 md:w-8 md:h-8" />
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <h3 className="text-xs md:text-sm font-bold text-stone-800 truncate mb-0.5 md:mb-1">{poem.title || '제목 없음'}</h3>
        <p className="text-[9px] md:text-[11px] text-stone-400 line-clamp-1 md:line-clamp-2 leading-relaxed">{poem.content.substring(0, 60)}...</p>
      </div>

      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
        <button 
          onClick={() => onEdit(poem)}
          className="p-3 transition-all text-stone-400 hover:text-stone-800 hover:bg-stone-50 rounded-full"
          title="수정"
        >
          <Edit3 className="w-4 h-4" />
        </button>
        <button 
          onClick={() => onRemove(poem.id)}
          className="p-3 transition-all text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-full"
          title="삭제"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
