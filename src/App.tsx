import { useState, useEffect, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Book, Save, Loader2, ChevronRight, ChevronLeft, FileCode, FileText, LogIn, LogOut, User, RefreshCw, Type, AlignLeft, AlignCenter, AlignRight, Wand2, Download, Palette, Settings, Trash2, Edit3, Image as ImageIcon, Upload, ArrowLeft, Share2, Database, Eye, Maximize2, Minimize2 } from 'lucide-react';
import { Poem, Book as BookType, ImageStyle, IMAGE_STYLES, AVAILABLE_FONTS, AppSettings, DEFAULT_SETTINGS } from './types';
import { generatePoemImage, generateBookCover } from './services/gemini';
import { compressBase64Image } from './services/imageUtils';
import { db, auth } from './services/firebase';
import { handleFirestoreError, OperationType } from './services/firestoreErrorHandler';
import { getDocFromServer, getDocs } from 'firebase/firestore';
import JSZip from 'jszip';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  orderBy,
  writeBatch,
  setDoc,
  getDoc
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import html2pdf from 'html2pdf.js';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortablePoemItem } from './components/SortablePoemItem';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [books, setBooks] = useState<BookType[]>([]);
  const [poems, setPoems] = useState<Poem[]>([]);
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'books' | 'editor' | 'preview' | 'settings'>('books');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingBook, setEditingBook] = useState<{ id?: string; title: string; style: ImageStyle }>({ title: '', style: 'watercolor' });
  const [editingPoem, setEditingPoem] = useState<{ 
    id?: string; 
    title: string; 
    content: string; 
    style: ImageStyle; 
    imageUrl?: string;
    fontSize?: Poem['fontSize'];
    textAlign?: Poem['textAlign'];
    fontFamily?: string;
    imageOpacity?: number;
  }>({
    title: '',
    content: '',
    style: 'watercolor',
    fontSize: 'xl',
    textAlign: 'center',
    fontFamily: 'Noto Serif KR',
    imageOpacity: 0.6
  });
  const [activePoemIndex, setActivePoemIndex] = useState(0);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportingBook, setExportingBook] = useState<BookType | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showBookModal, setShowBookModal] = useState(false);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; type: 'book' | 'poem' } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Connection Test
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Settings Listener
  useEffect(() => {
    if (!user) return;
    const settingsRef = doc(db, 'settings', user.uid);
    const unsubscribe = onSnapshot(settingsRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data() as AppSettings;
        setSettings(data);
        // Automatically update version if outdated
        if (data.version !== DEFAULT_SETTINGS.version) {
          updateDoc(settingsRef, { version: DEFAULT_SETTINGS.version });
        }
      } else {
        // Initialize settings if they don't exist
        setDoc(settingsRef, DEFAULT_SETTINGS).catch(e => handleFirestoreError(e, OperationType.WRITE, `settings/${user.uid}`));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `settings/${user.uid}`);
    });
    return () => unsubscribe();
  }, [user]);

  // Books Listener
  useEffect(() => {
    if (!user) {
      setBooks([]);
      return;
    }

    const q = query(
      collection(db, 'books'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const booksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as BookType[];
      setBooks(booksData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'books');
    });

    return () => unsubscribe();
  }, [user]);

  // Poems Listener
  useEffect(() => {
    if (!user || !currentBookId) {
      setPoems([]);
      return;
    }

    const q = query(
      collection(db, 'poems'),
      where('bookId', '==', currentBookId),
      orderBy('order', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const poemsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Poem[];
      setPoems(poemsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'poems');
    });

    return () => unsubscribe();
  }, [user, currentBookId]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login error:", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleSaveBook = async () => {
    if (!user || !editingBook.title) return;
    setIsGenerating(true);
    try {
      let finalCoverUrl = coverPreviewUrl;
      
      if (!finalCoverUrl) {
        const coverImageUrl = await generateBookCover(editingBook.title, editingBook.style);
        finalCoverUrl = await compressBase64Image(coverImageUrl, 800, 0.7);
      }

      if (editingBook.id) {
        await updateDoc(doc(db, 'books', editingBook.id), {
          title: editingBook.title,
          style: editingBook.style,
          coverImageUrl: finalCoverUrl,
          updatedAt: Date.now()
        }).catch(e => handleFirestoreError(e, OperationType.UPDATE, `books/${editingBook.id}`));
      } else {
        await addDoc(collection(db, 'books'), {
          title: editingBook.title,
          style: editingBook.style,
          coverImageUrl: finalCoverUrl,
          userId: user.uid,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }).catch(e => handleFirestoreError(e, OperationType.CREATE, 'books'));
      }
      setShowBookModal(false);
      setCoverPreviewUrl(null);
      setEditingBook({ title: '', style: settings.defaultStyle });
    } catch (error) {
      console.error("Save book error:", error);
      alert("시집 저장 중 오류가 발생했습니다: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGeneratePreviewCover = async () => {
    if (!editingBook.title) return;
    setIsGenerating(true);
    try {
      const coverImageUrl = await generateBookCover(editingBook.title, editingBook.style);
      const compressedCover = await compressBase64Image(coverImageUrl, 800, 0.7);
      setCoverPreviewUrl(compressedCover);
    } catch (error) {
      console.error("Preview cover error:", error);
      alert("표지 생성 중 오류가 발생했습니다: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteBook = (id: string) => {
    setConfirmDelete({ id, type: 'book' });
  };

  const removePoem = (id: string) => {
    setConfirmDelete({ id, type: 'poem' });
  };

  const executeDelete = async () => {
    if (!confirmDelete) return;
    const { id, type } = confirmDelete;
    setConfirmDelete(null);

    if (type === 'poem') {
      try {
        await deleteDoc(doc(db, 'poems', id)).catch(e => handleFirestoreError(e, OperationType.DELETE, `poems/${id}`));
      } catch (error) {
        console.error("Delete error:", error);
      }
    } else if (type === 'book') {
      try {
        const q = query(collection(db, 'poems'), where('bookId', '==', id));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        await deleteDoc(doc(db, 'books', id)).catch(e => handleFirestoreError(e, OperationType.DELETE, `books/${id}`));
        if (currentBookId === id) setCurrentBookId(null);
      } catch (error) {
        console.error("Delete book error:", error);
      }
    }
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      const compressed = await compressBase64Image(base64, 1024, 0.7);
      setEditingPoem({ ...editingPoem, imageUrl: compressed, imageOpacity: settings.photoOpacity });
    };
    reader.readAsDataURL(file);
  };

  const handleSavePoem = async () => {
    if (!user || !currentBookId || !editingPoem.title || !editingPoem.content) return;

    setIsGenerating(true);
    try {
      let imageUrl = editingPoem.imageUrl;
      
      if (!imageUrl) {
        const generatedImage = await generatePoemImage(editingPoem.title, editingPoem.content, editingPoem.style);
        imageUrl = await compressBase64Image(generatedImage, 1024, 0.7);
      }

      const poemData = {
        bookId: currentBookId,
        title: editingPoem.title,
        content: editingPoem.content,
        style: editingPoem.style,
        imageUrl,
        fontSize: editingPoem.fontSize || settings.defaultFontSize,
        textAlign: editingPoem.textAlign || 'center',
        fontFamily: editingPoem.fontFamily || 'Noto Serif KR',
        imageOpacity: editingPoem.imageOpacity ?? settings.photoOpacity,
        updatedAt: Date.now()
      };

      if (editingPoem.id) {
        await updateDoc(doc(db, 'poems', editingPoem.id), poemData).catch(e => handleFirestoreError(e, OperationType.UPDATE, `poems/${editingPoem.id}`));
      } else {
        await addDoc(collection(db, 'poems'), {
          ...poemData,
          userId: user.uid,
          order: poems.length,
          createdAt: Date.now()
        }).catch(e => handleFirestoreError(e, OperationType.CREATE, 'poems'));
      }
      
      setEditingPoem({ 
        title: '', 
        content: '', 
        style: settings.defaultStyle,
        fontSize: settings.defaultFontSize,
        textAlign: 'center',
        fontFamily: 'Noto Serif KR',
        imageOpacity: settings.photoOpacity
      });
    } catch (error) {
      console.error("Error saving poem:", error);
      alert("저장 중 오류가 발생했습니다: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEditPoem = (poem: Poem) => {
    setEditingPoem({
      id: poem.id,
      title: poem.title,
      content: poem.content,
      style: poem.style,
      imageUrl: poem.imageUrl,
      fontSize: poem.fontSize || 'xl',
      textAlign: poem.textAlign || 'center',
      fontFamily: poem.fontFamily || 'Noto Serif KR'
    });
    setCurrentView('editor');
  };

  const handleUpdatePoemStyle = async (id: string, updates: Partial<Poem>) => {
    try {
      const poemRef = doc(db, 'poems', id);
      await updateDoc(poemRef, {
        ...updates,
        updatedAt: Date.now()
      }).catch(e => handleFirestoreError(e, OperationType.UPDATE, `poems/${id}`));
    } catch (error) {
      console.error("Style update error:", error);
    }
  };

  const handleUpdateSettings = async (updates: Partial<AppSettings>) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'settings', user.uid), updates).catch(e => handleFirestoreError(e, OperationType.UPDATE, `settings/${user.uid}`));
    } catch (error) {
      console.error("Settings update error:", error);
    }
  };

  const handleBackup = async () => {
    if (!user) return;
    try {
      const backupData = {
        books,
        poems,
        settings,
        backupDate: Date.now()
      };
      const blob = new Blob([JSON.stringify(backupData)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `poetry_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Backup error:", error);
      alert("백업 중 오류가 발생했습니다.");
    }
  };

  const handleRestore = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (!data.books || !data.poems) throw new Error("Invalid backup file");

        const batch = writeBatch(db);
        
        // Restore books
        for (const book of data.books) {
          const { id, ...bookData } = book;
          batch.set(doc(db, 'books', id), { ...bookData, userId: user.uid });
        }

        // Restore poems
        for (const poem of data.poems) {
          const { id, ...poemData } = poem;
          batch.set(doc(db, 'poems', id), { ...poemData, userId: user.uid });
        }

        // Restore settings
        if (data.settings) {
          batch.set(doc(db, 'settings', user.uid), data.settings);
        }

        await batch.commit().catch(e => handleFirestoreError(e, OperationType.WRITE, 'batch-restore'));
        alert("복원이 완료되었습니다.");
      } catch (error) {
        console.error("Restore error:", error);
        alert("복원 중 오류가 발생했습니다. 파일 형식을 확인해주세요.");
      }
    };
    reader.readAsText(file);
  };

  const handleRegenerateImage = async (poem: Poem) => {
    setIsGenerating(true);
    try {
      const generatedImage = await generatePoemImage(poem.title, poem.content, poem.style);
      const imageUrl = await compressBase64Image(generatedImage, 1024, 0.7);
      
      const poemRef = doc(db, 'poems', poem.id);
      await updateDoc(poemRef, {
        imageUrl,
        updatedAt: Date.now()
      }).catch(e => handleFirestoreError(e, OperationType.UPDATE, `poems/${poem.id}`));
    } catch (error) {
      console.error("Regenerate error:", error);
      alert("이미지 재생성 중 오류가 발생했습니다: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = poems.findIndex((p) => p.id === active.id);
      const newIndex = poems.findIndex((p) => p.id === over.id);

      const newOrder = arrayMove(poems, oldIndex, newIndex);
      setPoems(newOrder); // Optimistic update

      // Update Firestore
      const batch = writeBatch(db);
      newOrder.forEach((poem, index) => {
        const ref = doc(db, 'poems', (poem as Poem).id);
        batch.update(ref, { order: index });
      });
      
      try {
        await batch.commit().catch(e => handleFirestoreError(e, OperationType.WRITE, 'batch-reorder'));
      } catch (error) {
        console.error("Reorder error:", error);
        // Revert on error if needed, but onSnapshot will fix it
      }
    }
  };

  const exportAsHTML = () => {
    const book = exportingBook || books.find(b => b.id === currentBookId);
    const htmlContent = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${book?.title || '디지털 시집'}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        ${AVAILABLE_FONTS.map(f => `@import url('https://fonts.googleapis.com/css2?family=${f.import}&display=swap');`).join('\n        ')}
        body { background: #1a1512; color: #fff; overflow-x: hidden; margin: 0; }
        .page-container { height: 100vh; scroll-snap-type: y mandatory; overflow-y: scroll; scroll-behavior: smooth; }
        .page { min-height: 100vh; scroll-snap-align: start; position: relative; display: flex; align-items: center; justify-content: center; overflow-y: auto; padding: 100px 0; }
        .bg-wrapper { position: absolute; inset: 40px; border-radius: 30px; overflow: hidden; z-index: 0; }
        .bg-image { position: absolute; inset: 0; background-size: cover; background-position: center; filter: brightness(0.5); }
        .content { position: relative; z-index: 10; max-width: 800px; padding: 4rem 2rem; margin: 0 auto; }
        .nav { position: fixed; right: 2rem; top: 50%; transform: translateY(-50%); z-index: 100; display: flex; flex-direction: column; gap: 1rem; }
        .nav-item { cursor: pointer; opacity: 0.5; transition: all 0.3s; font-size: 0.8rem; text-align: right; color: white; text-decoration: none; font-family: sans-serif; }
        .nav-item:hover, .nav-item.active { opacity: 1; transform: translateX(-5px); }
        .poem-content { white-space: pre-wrap; line-height: 2; }
        .footer { position: absolute; bottom: 30px; left: 0; right: 0; text-align: center; font-size: 10px; color: rgba(255,255,255,0.3); z-index: 20; letter-spacing: 0.1em; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-in { animation: fadeIn 1.5s ease-out forwards; }
        
        .text-sm { font-size: 0.875rem; }
        .text-base { font-size: 1rem; }
        .text-lg { font-size: 1.125rem; }
        .text-xl { font-size: 1.25rem; }
        .text-2xl { font-size: 1.5rem; }
        .text-3xl { font-size: 1.875rem; }
        .text-left { text-align: left; }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
    </style>
</head>
<body>
    <div class="nav">
        <a href="#cover" class="nav-item active" id="nav-cover">표지</a>
        ${poems.map((p, i) => `<a href="#page-${i}" class="nav-item" id="nav-${i}">${p.title}</a>`).join('')}
    </div>
    <div class="page-container" id="container">
        <div class="page" id="cover">
            <div class="bg-wrapper"><div class="bg-image" style="background-image: url('${book?.coverImageUrl || ''}')"></div></div>
            <div class="content animate-in text-center">
                <h1 class="text-6xl mb-6 font-light tracking-[0.3em] uppercase">${book?.title || '나의 시집'}</h1>
                <p class="text-stone-400 tracking-widest uppercase text-sm">Created by ${user?.displayName || 'Anonymous'}</p>
            </div>
            <div class="footer">© ggummana2@gmail.com | Version 1.1.3</div>
        </div>
        ${poems.map((p, i) => `
            <div class="page" id="page-${i}">
                <div class="bg-wrapper"><div class="bg-image" style="background-image: url('${p.imageUrl}')"></div></div>
                <div class="content animate-in text-${p.textAlign || 'center'}" style="font-family: '${p.fontFamily || 'Noto Serif KR'}', serif;">
                    <h1 class="text-4xl mb-12 font-bold tracking-widest">${p.title}</h1>
                    <div class="poem-content text-${p.fontSize || 'xl'}">${p.content}</div>
                </div>
                <div class="footer">© ggummana2@gmail.com | Version 1.1.3</div>
            </div>
        `).join('')}
    </div>
    <script>
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const id = entry.target.id === 'cover' ? 'cover' : entry.target.id.split('-')[1];
                    document.querySelectorAll('.nav-item').forEach((item) => {
                        if(item.id === 'nav-' + id) item.classList.add('active');
                        else item.classList.remove('active');
                    });
                }
            });
        }, { threshold: 0.5 });
        
        document.querySelectorAll('.page').forEach(page => observer.observe(page));
    </script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'digital_poetry_book.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAsEPUB = async () => {
    const book = exportingBook || books.find(b => b.id === currentBookId);
    const zip = new JSZip();
    
    // mimetype
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    
    // META-INF/container.xml
    zip.folder('META-INF').file('container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
    <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
    </rootfiles>
</container>`);

    // OEBPS/content.opf
    const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>${book?.title || 'Digital Poetry Book'}</dc:title>
        <dc:language>ko</dc:language>
        <dc:identifier id="bookid">urn:uuid:${crypto.randomUUID()}</dc:identifier>
        <dc:creator>${user?.displayName || 'Anonymous'}</dc:creator>
        <meta property="dcterms:modified">${new Date().toISOString().replace(/\.[0-9]+Z$/, 'Z')}</meta>
    </metadata>
    <manifest>
        <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
        <item id="style" href="style.css" media-type="text/css"/>
        <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
        <item id="cover-img" href="cover.jpg" media-type="image/jpeg"/>
        ${poems.map((p, i) => `<item id="page${i}" href="page${i}.xhtml" media-type="application/xhtml+xml"/>`).join('\n        ')}
        ${poems.map((p, i) => `<item id="img${i}" href="img${i}.jpg" media-type="image/jpeg"/>`).join('\n        ')}
    </manifest>
    <spine toc="ncx">
        <itemref idref="cover"/>
        ${poems.map((p, i) => `<itemref idref="page${i}"/>`).join('\n        ')}
    </spine>
</package>`;
    zip.folder('OEBPS').file('content.opf', opf);

    // OEBPS/toc.ncx
    const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
    <head>
        <meta name="dtb:uid" content="urn:uuid:12345"/>
        <meta name="dtb:depth" content="1"/>
    </head>
    <docTitle><text>${book?.title || 'Digital Poetry Book'}</text></docTitle>
    <navMap>
        <navPoint id="navpoint-cover" playOrder="1">
            <navLabel><text>표지</text></navLabel>
            <content src="cover.xhtml"/>
        </navPoint>
        ${poems.map((p, i) => `
        <navPoint id="navpoint-${i}" playOrder="${i + 2}">
            <navLabel><text>${p.title}</text></navLabel>
            <content src="page${i}.xhtml"/>
        </navPoint>`).join('')}
    </navMap>
</ncx>`;
    zip.folder('OEBPS').file('toc.ncx', ncx);

    // OEBPS/style.css
    zip.folder('OEBPS').file('style.css', `
        body { font-family: serif; background: #000; color: #fff; margin: 0; padding: 0; }
        .page { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 20px; }
        .title { font-size: 2em; margin-bottom: 1em; }
        .content { font-size: 1.2em; white-space: pre-wrap; }
        .bg-img { width: 100%; max-width: 600px; margin-bottom: 20px; }
        .text-sm { font-size: 0.8em; }
        .text-base { font-size: 1em; }
        .text-lg { font-size: 1.1em; }
        .text-xl { font-size: 1.2em; }
        .text-2xl { font-size: 1.5em; }
        .text-3xl { font-size: 1.8em; }
        .text-left { text-align: left; }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .footer { font-size: 0.7em; color: #666; margin-top: 2em; text-align: center; }
        ${AVAILABLE_FONTS.map(f => `.font-${f.id.replace(/\s+/g, '-')} { font-family: "${f.id}", serif; }`).join('\n        ')}
    `);

    // Cover page
    const coverXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <title>Cover</title>
    <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
    <div class="page">
        <img src="cover.jpg" class="bg-img"/>
        <h1 class="title">${book?.title || '나의 시집'}</h1>
        <p>Created by ${user?.displayName || 'Anonymous'}</p>
        <p class="footer">© ggummana2@gmail.com | Version 1.1.3</p>
    </div>
</body>
</html>`;
    zip.folder('OEBPS').file('cover.xhtml', coverXhtml);
    if (book?.coverImageUrl) {
        try {
            const imgData = book.coverImageUrl.split(',')[1];
            zip.folder('OEBPS').file('cover.jpg', imgData, { base64: true });
        } catch (e) { console.error(e); }
    }

    // Pages and Images
    for (let i = 0; i < poems.length; i++) {
      const p = poems[i];
      const fontClass = `font-${(p.fontFamily || 'Noto Serif KR').replace(/\s+/g, '-')}`;
      const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <title>${p.title}</title>
    <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
    <div class="page text-${p.textAlign || 'center'} ${fontClass}">
        <img src="img${i}.jpg" class="bg-img"/>
        <h1 class="title">${p.title}</h1>
        <div class="content text-${p.fontSize || 'xl'}">${p.content}</div>
        <p class="footer">© ggummana2@gmail.com | Version 1.1.3</p>
    </div>
</body>
</html>`;
      zip.folder('OEBPS').file(`page${i}.xhtml`, xhtml);
      
      if (p.imageUrl) {
        try {
          const imgData = p.imageUrl.split(',')[1];
          zip.folder('OEBPS').file(`img${i}.jpg`, imgData, { base64: true });
        } catch (e) {
          console.error("Image error for epub:", e);
        }
      }
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'digital_poetry_book.epub';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAsDOC = () => {
    const book = exportingBook || books.find(b => b.id === currentBookId);
    const htmlContent = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>${book?.title || '디지털 시집'}</title>
    <style>
        body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; line-height: 1.6; padding: 40px; }
        .page-break { page-break-after: always; }
        .poem { position: relative; margin-bottom: 50px; border-bottom: 1px solid #eee; padding-bottom: 50px; min-height: 800px; }
        .title { font-size: 24pt; font-weight: bold; margin-bottom: 20pt; text-align: center; color: #333; position: relative; z-index: 2; }
        .content { font-size: 14pt; white-space: pre-wrap; text-align: center; color: #111; position: relative; z-index: 2; }
        .bg-img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.4; z-index: 1; border-radius: 15px; }
        .cover { text-align: center; margin-bottom: 100px; padding-top: 50px; position: relative; min-height: 800px; }
    </style>
</head>
<body>
    <div class="cover page-break">
        ${book?.coverImageUrl ? `<img src="${book.coverImageUrl}" class="bg-img"/>` : ''}
        <h1 style="font-size: 36pt; margin-top: 30px; position: relative; z-index: 2;">${book?.title || '나의 시집'}</h1>
        <p style="font-size: 14pt; color: #666; position: relative; z-index: 2;">Created by ${user?.displayName || 'Anonymous'}</p>
        <div style="position: absolute; bottom: 40px; left: 0; right: 0; text-align: center; font-size: 9pt; color: #999; z-index: 2;">© ggummana2@gmail.com | Version 1.1.3</div>
    </div>
    ${poems.map((p) => `
        <div class="poem page-break">
            ${p.imageUrl ? `<img src="${p.imageUrl}" class="bg-img"/>` : ''}
            <h1 class="title">${p.title}</h1>
            <div class="content">${p.content}</div>
            <div style="position: absolute; bottom: 40px; left: 0; right: 0; text-align: center; font-size: 9pt; color: #999; z-index: 2;">© ggummana2@gmail.com | Version 1.1.3</div>
        </div>
    `).join('')}
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${book?.title || 'poetry_book'}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAsPDF = () => {
    const book = exportingBook || books.find(b => b.id === currentBookId);
    const container = document.createElement('div');
    container.style.width = '800px';
    container.style.background = '#ffffff';
    container.style.color = '#000000';
    container.style.fontFamily = "'Noto Serif KR', serif";

    const coverHtml = `
      <div style="min-height: 1130px; position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px; text-align: center; page-break-after: always;">
        ${book?.coverImageUrl ? `<img src="${book.coverImageUrl}" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.3; z-index: 1;"/>` : ''}
        <div style="position: relative; z-index: 2;">
          <h1 style="font-size: 48pt; margin-bottom: 20px; font-weight: 300; letter-spacing: 0.2em;">${book?.title || '나의 시집'}</h1>
          <p style="font-size: 14pt; color: #333; letter-spacing: 0.1em;">Created by ${user?.displayName || 'Anonymous'}</p>
        </div>
        <div style="position: absolute; bottom: 30px; left: 0; right: 0; text-align: center; font-size: 9pt; color: rgba(0,0,0,0.3); z-index: 10;">© ggummana2@gmail.com | Version 1.1.3</div>
      </div>
    `;

    const poemsHtml = poems.map((p) => {
      // Dynamic font size calculation based on content length
      const contentLength = p.content.length;
      let fontSize = 16; // Default
      if (contentLength > 1200) fontSize = 10;
      else if (contentLength > 1000) fontSize = 11;
      else if (contentLength > 800) fontSize = 12;
      else if (contentLength > 500) fontSize = 14;

      return `
        <div style="min-height: 1130px; position: relative; display: flex; flex-direction: column; padding: 100px 60px; page-break-after: always;">
          ${p.imageUrl ? `<img src="${p.imageUrl}" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.25; z-index: 1;"/>` : ''}
          <div style="position: relative; z-index: 2; flex: 1; display: flex; flex-direction: column; align-items: ${p.textAlign === 'left' ? 'flex-start' : p.textAlign === 'right' ? 'flex-end' : 'center'}; text-align: ${p.textAlign || 'center'};">
            <h2 style="font-size: 28pt; margin-bottom: 40px; font-weight: bold; border-bottom: 2px solid rgba(0,0,0,0.1); padding-bottom: 15px; width: 100%;">${p.title}</h2>
            <div style="font-size: ${fontSize}pt; line-height: 2; white-space: pre-wrap; color: #000; width: 100%;">${p.content}</div>
          </div>
          <div style="position: absolute; bottom: 30px; left: 0; right: 0; text-align: center; font-size: 9pt; color: rgba(0,0,0,0.3); z-index: 10;">© ggummana2@gmail.com | Version 1.1.3</div>
        </div>
      `;
    }).join('');

    container.innerHTML = coverHtml + poemsHtml;
    document.body.appendChild(container);

    const opt = {
      margin: 0,
      filename: `${book?.title || 'poetry_book'}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'px' as const, format: [800, 1131] as [number, number], orientation: 'portrait' as const }
    };

    html2pdf().from(container).set(opt).save().then(() => {
      document.body.removeChild(container);
    }).catch(err => {
      console.error("PDF generation error:", err);
      document.body.removeChild(container);
    });
  };

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0502]">
        <Loader2 className="w-8 h-8 text-stone-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen font-serif selection:bg-stone-500/30" style={{ backgroundColor: settings.themeColor, color: 'var(--app-text)' }}>
      {/* Navigation Bar */}
      <nav className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-8 py-4 md:py-6 bg-white/95 backdrop-blur-md border-b border-black/5 transition-all duration-500 ${isFullscreen && currentView === 'preview' ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`} style={{ backgroundColor: `${settings.themeColor}F2` }}>
        <div className="flex items-center gap-2 md:gap-3 cursor-pointer" onClick={() => setCurrentView('books')}>
          <Book className="w-5 h-5 md:w-6 md:h-6 text-stone-500" />
          <h1 className="text-lg md:text-xl font-light tracking-[0.2em] uppercase hidden sm:block">나만의 시집 만들기</h1>
        </div>
        
        <div className="flex items-center gap-3 md:gap-6">
          {user ? (
            <>
              <button 
                onClick={() => setCurrentView('books')}
                className={`text-xs md:text-sm tracking-widest uppercase transition-colors ${currentView === 'books' ? 'text-black font-bold' : 'text-stone-500 hover:text-stone-800'}`}
                title="시집 목록"
              >
                <span className="hidden md:inline">시집 목록</span>
                <Book className="w-4 h-4 md:hidden" />
              </button>
              {currentBookId && (
                <>
                  <button 
                    onClick={() => setCurrentView('editor')}
                    className={`text-xs md:text-sm tracking-widest uppercase transition-colors ${currentView === 'editor' ? 'text-black font-bold' : 'text-stone-500 hover:text-stone-800'}`}
                    title="에디터"
                  >
                    <span className="hidden md:inline">에디터</span>
                    <Edit3 className="w-4 h-4 md:hidden" />
                  </button>
                  <button 
                    onClick={() => setCurrentView('preview')}
                    className={`text-xs md:text-sm tracking-widest uppercase transition-colors ${currentView === 'preview' ? 'text-black font-bold' : 'text-stone-500 hover:text-stone-800'}`}
                    title="미리보기"
                  >
                    <span className="hidden md:inline">미리보기</span>
                    <Eye className="w-4 h-4 md:hidden" />
                  </button>
                </>
              )}
              <button 
                onClick={() => setCurrentView('settings')}
                className={`p-2 rounded-full transition-colors ${currentView === 'settings' ? 'bg-stone-200' : 'text-stone-500 hover:bg-stone-100'}`}
                title="설정"
              >
                <Settings className="w-4 h-4 md:w-5 md:h-5" />
              </button>
              <div className="flex items-center gap-2 md:gap-3 pl-3 md:pl-6 border-l border-stone-200">
                <div className="hidden md:flex flex-col items-end">
                  <span className="text-[10px] text-stone-500 uppercase tracking-tighter">{user.displayName}</span>
                  <button onClick={handleLogout} className="text-[10px] text-stone-400 hover:text-stone-600 uppercase tracking-widest">Sign Out</button>
                </div>
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Sign Out" className="w-6 h-6 md:w-8 md:h-8 rounded-full border border-stone-200 cursor-pointer md:cursor-default" onClick={() => { if(window.innerWidth < 768) handleLogout() }} />
                ) : (
                  <User className="w-6 h-6 md:w-8 md:h-8 p-1 rounded-full border border-stone-200 text-stone-400 cursor-pointer md:cursor-default" onClick={() => { if(window.innerWidth < 768) handleLogout() }} />
                )}
              </div>
            </>
          ) : (
            <button 
              onClick={handleLogin}
              className="flex items-center gap-2 px-4 md:px-6 py-2 text-[10px] md:text-xs tracking-widest uppercase transition-all bg-stone-800 text-white rounded-full hover:bg-black"
            >
              <LogIn className="w-4 h-4" />
              <span className="hidden sm:inline">Sign In with Google</span>
              <span className="sm:hidden">Sign In</span>
            </button>
          )}
        </div>
      </nav>

      <main className={`${isFullscreen && currentView === 'preview' ? 'pt-0' : 'pt-24'} ${currentView === 'preview' ? '' : 'pb-12'} transition-all duration-500`}>
        {!user ? (
          <div className="flex flex-col items-center justify-center h-[60vh] px-6 text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-md space-y-6"
            >
              <Book className="w-16 h-16 mx-auto text-stone-300" />
              <h2 className="text-3xl font-light tracking-widest uppercase">나만의 시집을 시작하세요</h2>
              <p className="text-stone-500 leading-relaxed">
                로그인하여 여러 개의 시집을 만들고, AI 이미지를 생성하며, 아름다운 디지털 시집을 영구적으로 보관하세요.
              </p>
              <button 
                onClick={handleLogin}
                className="inline-flex items-center gap-3 px-8 py-4 text-sm font-bold tracking-[0.2em] uppercase transition-all bg-stone-800 text-white rounded-full hover:bg-black"
              >
                <LogIn className="w-5 h-5" />
                Get Started
              </button>
            </motion.div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {currentView === 'books' ? (
              <motion.div 
                key="books"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-7xl px-8 mx-auto"
              >
                <div className="flex items-end justify-between mb-16">
                  <div>
                    <h2 className="text-4xl font-light tracking-tight">나의 시집 목록</h2>
                    <p className="text-xs uppercase tracking-[0.4em] text-stone-400 mt-2">Personal Poetry Collections</p>
                  </div>
                  <button 
                    onClick={() => { setEditingBook({ title: '', style: settings.defaultStyle }); setShowBookModal(true); }}
                    className="flex items-center gap-3 px-8 py-4 bg-stone-800 text-white rounded-full hover:bg-black transition-all shadow-xl hover:scale-105 active:scale-95"
                  >
                    <Plus className="w-5 h-5" />
                    <span className="text-xs font-bold tracking-widest uppercase">시집 추가</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-12">
                  {books.map((book) => (
                    <motion.div
                      key={book.id}
                      whileHover={{ y: -12 }}
                      className="group relative aspect-[3/4.2] bg-white rounded-[2.5rem] overflow-hidden shadow-sm hover:shadow-2xl transition-all duration-500 border border-stone-200"
                    >
                      {book.coverImageUrl ? (
                        <img src={book.coverImageUrl} alt={book.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                      ) : (
                        <div className="absolute inset-0 bg-stone-50 flex items-center justify-center">
                          <Book className="w-16 h-16 text-stone-200" />
                        </div>
                      )}
                      
                      {/* Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-40 group-hover:opacity-70 transition-opacity duration-500" />
                      
                      {/* Content */}
                      <div className="absolute inset-0 p-8 flex flex-col justify-end text-white">
                        <div className="transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
                          <h3 className="text-2xl font-light tracking-tight mb-1">{book.title}</h3>
                          <p className="text-[10px] text-white/50 uppercase tracking-[0.2em] mb-8">Created {new Date(book.createdAt).toLocaleDateString()}</p>
                          
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-500 delay-100">
                            <button 
                              onClick={() => { setCurrentBookId(book.id); setCurrentView('editor'); }}
                              className="flex-1 py-3 bg-white text-black text-[10px] font-bold uppercase tracking-[0.2em] rounded-xl hover:bg-stone-100 transition-colors"
                            >
                              열기
                            </button>
                            <button 
                              onClick={() => { setEditingBook({ id: book.id, title: book.title, style: book.style }); setShowBookModal(true); }}
                              className="p-3 bg-white/10 backdrop-blur-md rounded-xl hover:bg-white/30 transition-colors"
                              title="설정"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={async () => {
                                setExportingBook(book);
                                // Fetch poems for this book
                                const q = query(collection(db, 'poems'), where('bookId', '==', book.id), orderBy('order', 'asc'));
                                const snapshot = await getDocs(q);
                                const fetchedPoems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Poem));
                                setPoems(fetchedPoems);
                                setCurrentBookId(book.id);
                                setShowExportModal(true);
                              }}
                              className="p-3 bg-white/10 backdrop-blur-md rounded-xl hover:bg-white/30 transition-colors"
                              title="파일로 저장"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => deleteBook(book.id)}
                              className="p-3 bg-red-500/10 backdrop-blur-md rounded-xl hover:bg-red-500/30 transition-colors"
                              title="삭제"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  
                  {books.length === 0 && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={() => { setEditingBook({ title: '', style: settings.defaultStyle }); setShowBookModal(true); }}
                      className="aspect-[3/4.2] border-2 border-dashed border-stone-200 rounded-[2.5rem] flex flex-col items-center justify-center text-stone-300 hover:border-stone-400 hover:text-stone-500 cursor-pointer transition-all group bg-white/30"
                    >
                      <div className="w-20 h-20 rounded-full bg-stone-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                        <Plus className="w-8 h-8 opacity-20" />
                      </div>
                      <p className="text-xs font-bold uppercase tracking-[0.2em]">첫 번째 시집 만들기</p>
                    </motion.div>
                  )}
                </div>

                {/* Main Footer */}
                <div className="mt-24 pb-12 flex flex-col items-center gap-4 opacity-30">
                  <div className="h-[1px] w-24 bg-stone-300 mb-4" />
                  <p className="text-[9px] tracking-[0.5em] uppercase text-stone-500">나만의 시집 만들기</p>
                  <p className="text-[8px] tracking-[0.3em] uppercase text-stone-400">© ggummana2@gmail.com | Version {settings.version}</p>
                </div>
              </motion.div>
            ) : currentView === 'settings' ? (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-3xl px-8 mx-auto"
              >
                <div className="flex items-center gap-6 mb-12">
                  <button onClick={() => setCurrentView('books')} className="p-3 hover:bg-black/5 rounded-full transition-colors border border-black/5 bg-white/50">
                    <ArrowLeft className="w-6 h-6" />
                  </button>
                  <div>
                    <h2 className="text-3xl font-light tracking-tight">환경 설정</h2>
                    <p className="text-xs uppercase tracking-[0.3em] text-stone-400 mt-1">App Customization & Data</p>
                  </div>
                </div>

                <div className="bg-white rounded-[3rem] border border-stone-200 shadow-sm overflow-hidden">
                  <div className="p-12 space-y-16">
                    {/* Theme Color */}
                    <section className="space-y-6">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-3 text-[10px] font-bold tracking-[0.3em] uppercase text-stone-400">
                          <Palette className="w-4 h-4" />
                          앱 테마 색상
                        </label>
                        <span className="text-[10px] font-mono text-stone-300">{settings.themeColor}</span>
                      </div>
                      <div className="flex flex-wrap gap-4">
                        {['#f5f5f4', '#fafaf9', '#ffffff', '#e7e5e4', '#d6d3d1', '#fef9c3', '#dcfce7', '#fce7f3', '#f5ebe0', '#f3e8ff', '#262626'].map(color => (
                          <button
                            key={color}
                            onClick={() => handleUpdateSettings({ themeColor: color })}
                            className={`w-10 h-10 rounded-2xl border-2 transition-all duration-500 ${settings.themeColor === color ? 'border-stone-800 scale-110 shadow-lg' : 'border-transparent hover:scale-105'}`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </section>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                      {/* Default Style */}
                      <section className="space-y-6">
                        <label className="flex items-center gap-3 text-[10px] font-bold tracking-[0.3em] uppercase text-stone-400">
                          <Wand2 className="w-4 h-4" />
                          기본 이미지 스타일
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {IMAGE_STYLES.map(style => (
                            <button
                              key={style.id}
                              onClick={() => handleUpdateSettings({ defaultStyle: style.id })}
                              className={`p-4 text-[10px] rounded-2xl border transition-all ${settings.defaultStyle === style.id ? 'bg-stone-800 text-white border-stone-800 shadow-md' : 'bg-stone-50 text-stone-500 border-stone-100 hover:border-stone-300'}`}
                            >
                              {style.label}
                            </button>
                          ))}
                        </div>
                      </section>

                      {/* Default Font Size */}
                      <section className="space-y-6">
                        <label className="flex items-center gap-3 text-[10px] font-bold tracking-[0.3em] uppercase text-stone-400">
                          <Type className="w-4 h-4" />
                          기본 글자 크기
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['sm', 'base', 'lg', 'xl', '2xl', '3xl'] as Poem['fontSize'][]).map(size => (
                            <button
                              key={size}
                              onClick={() => handleUpdateSettings({ defaultFontSize: size })}
                              className={`py-3 text-[10px] font-bold uppercase rounded-xl border transition-all ${settings.defaultFontSize === size ? 'bg-stone-800 text-white border-stone-800 shadow-md' : 'bg-stone-50 text-stone-500 border-stone-100 hover:border-stone-300'}`}
                            >
                              {size}
                            </button>
                          ))}
                        </div>
                      </section>
                    </div>

                    {/* Photo Opacity */}
                    <section className="space-y-6">
                      <div className="flex justify-between items-center">
                        <label className="flex items-center gap-3 text-[10px] font-bold tracking-[0.3em] uppercase text-stone-400">
                          <ImageIcon className="w-4 h-4" />
                          사진 업로드 시 기본 불투명도
                        </label>
                        <span className="text-[10px] font-mono text-stone-500">{Math.round(settings.photoOpacity * 100)}%</span>
                      </div>
                      <div className="px-2">
                        <input 
                          type="range" 
                          min="0.1" 
                          max="1.0" 
                          step="0.1" 
                          value={settings.photoOpacity}
                          onChange={(e) => handleUpdateSettings({ photoOpacity: parseFloat(e.target.value) })}
                          className="w-full h-2 bg-stone-100 rounded-lg appearance-none cursor-pointer accent-stone-800"
                        />
                      </div>
                    </section>

                    {/* Backup & Restore */}
                    <section className="space-y-6 pt-12 border-t border-stone-100">
                      <label className="flex items-center gap-3 text-[10px] font-bold tracking-[0.3em] uppercase text-stone-400">
                        <Database className="w-4 h-4" />
                        데이터 백업 및 복구
                      </label>
                      <div className="grid grid-cols-2 gap-4">
                        <button 
                          onClick={handleBackup}
                          className="flex items-center justify-center gap-3 py-5 bg-stone-50 text-stone-800 rounded-2xl hover:bg-stone-100 transition-all text-xs font-bold tracking-widest uppercase border border-stone-100"
                        >
                          <Download className="w-4 h-4" />
                          자료 백업하기
                        </button>
                        <label className="flex items-center justify-center gap-3 py-5 bg-stone-50 text-stone-800 rounded-2xl hover:bg-stone-100 transition-all text-xs font-bold tracking-widest uppercase border border-stone-100 cursor-pointer">
                          <Upload className="w-4 h-4" />
                          백업자료 불러오기
                          <input type="file" accept=".json" onChange={handleRestore} className="hidden" />
                        </label>
                      </div>
                    </section>
                  </div>

                  {/* Footer */}
                  <div className="bg-stone-50 px-12 py-6 flex flex-col md:flex-row justify-between items-center border-t border-stone-100 gap-4">
                    <div className="flex flex-col items-center md:items-start gap-1">
                      <span className="text-[10px] text-stone-400 uppercase tracking-[0.2em]">나만의 시집 만들기</span>
                      <span className="text-[9px] text-stone-300 uppercase tracking-widest">© ggummana2@gmail.com</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-stone-300 uppercase tracking-widest">Version</span>
                      <span className="text-[10px] font-bold text-stone-500">{settings.version}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : currentView === 'editor' ? (
              <motion.div 
                key="editor"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-7xl px-8 mx-auto"
              >
                <div className="flex items-center justify-between mb-12">
                  <div className="flex items-center gap-6">
                    <button onClick={() => setCurrentView('books')} className="p-3 hover:bg-black/5 rounded-full transition-colors border border-black/5 bg-white/50">
                      <ArrowLeft className="w-6 h-6" />
                    </button>
                    <div>
                      <h2 className="text-3xl font-light tracking-tight">
                        {books.find(b => b.id === currentBookId)?.title}
                      </h2>
                      <p className="text-xs uppercase tracking-[0.3em] text-stone-400 mt-1">시 편집 및 구성</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setCurrentView('preview')}
                      className="flex items-center gap-2 px-6 py-3 bg-white text-stone-800 border border-stone-200 rounded-full hover:bg-stone-50 transition-all text-sm font-bold tracking-widest uppercase shadow-sm"
                    >
                      <Book className="w-4 h-4" />
                      미리보기
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-16 lg:grid-cols-12">
                  {/* Editor Section */}
                  <div className="lg:col-span-7 space-y-12">
                    <div className="bg-white p-12 rounded-[3rem] border border-stone-200 shadow-sm space-y-12">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold tracking-[0.4em] uppercase text-stone-300">
                          {editingPoem.id ? 'Editing Poem' : 'New Creation'}
                        </span>
                        {editingPoem.id && (
                          <button 
                            onClick={() => setEditingPoem({ 
                              title: '', 
                              content: '', 
                              style: settings.defaultStyle,
                              fontSize: settings.defaultFontSize,
                              textAlign: 'center',
                              fontFamily: 'Noto Serif KR',
                              imageOpacity: settings.photoOpacity
                            })}
                            className="text-[10px] tracking-widest uppercase text-stone-400 hover:text-stone-800 flex items-center gap-2 transition-colors"
                          >
                            <RefreshCw className="w-3 h-3" />
                            새로 쓰기
                          </button>
                        )}
                      </div>

                      <div className="space-y-12">
                        <div className="space-y-4">
                          <input 
                            type="text"
                            value={editingPoem.title}
                            onChange={(e) => setEditingPoem({ ...editingPoem, title: e.target.value })}
                            placeholder="시 제목"
                            className="w-full px-0 py-4 text-5xl font-bold bg-transparent border-b-2 border-stone-100 focus:border-stone-800 focus:outline-none transition-all placeholder:text-stone-200 tracking-tight"
                          />
                        </div>

                        <div className="space-y-4">
                          <textarea 
                            value={editingPoem.content}
                            onChange={(e) => setEditingPoem({ ...editingPoem, content: e.target.value })}
                            placeholder="여기에 시를 적어주세요..."
                            rows={12}
                            className="w-full p-0 text-2xl leading-[1.8] bg-transparent focus:outline-none transition-all placeholder:text-stone-200 resize-none font-serif"
                          />
                        </div>
                      </div>

                      <div className="pt-12 border-t border-stone-100 grid grid-cols-1 md:grid-cols-2 gap-12">
                        <div className="space-y-6">
                          <label className="block text-[10px] font-bold tracking-[0.3em] uppercase text-stone-400">이미지 스타일</label>
                          <div className="grid grid-cols-2 gap-2">
                            {IMAGE_STYLES.map((style) => (
                              <button
                                key={style.id}
                                onClick={() => setEditingPoem({ ...editingPoem, style: style.id, imageUrl: undefined })}
                                className={`p-3 text-[10px] text-center rounded-xl border transition-all ${
                                  editingPoem.style === style.id 
                                    ? 'bg-stone-800 text-white border-stone-800 shadow-md' 
                                    : 'bg-stone-50 text-stone-500 border-stone-200 hover:border-stone-400'
                                }`}
                              >
                                {style.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-6">
                          <label className="block text-[10px] font-bold tracking-[0.3em] uppercase text-stone-400">배경 이미지</label>
                          <div className="flex flex-col gap-4">
                            {editingPoem.imageUrl ? (
                              <div className="relative aspect-video rounded-2xl overflow-hidden border border-stone-200 group">
                                <img src={editingPoem.imageUrl} alt="Preview" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" style={{ opacity: editingPoem.imageOpacity }} />
                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <button 
                                    onClick={() => setEditingPoem({ ...editingPoem, imageUrl: undefined })}
                                    className="p-3 bg-white text-black rounded-full shadow-xl hover:bg-stone-100"
                                  >
                                    <Trash2 className="w-5 h-5" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <label className="flex flex-col items-center justify-center gap-4 aspect-video border-2 border-dashed border-stone-200 rounded-2xl text-stone-400 hover:border-stone-400 hover:text-stone-600 cursor-pointer transition-all bg-stone-50/50">
                                <div className="p-4 bg-white rounded-full shadow-sm">
                                  <Upload className="w-6 h-6" />
                                </div>
                                <div className="text-center">
                                  <span className="text-[10px] font-bold uppercase tracking-widest block">사진 업로드</span>
                                  <span className="text-[9px] opacity-60 mt-1 block">또는 저장 시 AI 자동 생성</span>
                                </div>
                                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                              </label>
                            )}
                            {editingPoem.imageUrl && (
                              <div className="space-y-3 bg-stone-50 p-4 rounded-2xl border border-stone-100">
                                <div className="flex justify-between items-center">
                                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">배경 불투명도</label>
                                  <span className="text-[10px] font-mono text-stone-500">{Math.round((editingPoem.imageOpacity ?? settings.photoOpacity) * 100)}%</span>
                                </div>
                                <input 
                                  type="range" 
                                  min="0.1" 
                                  max="1.0" 
                                  step="0.1" 
                                  value={editingPoem.imageOpacity ?? settings.photoOpacity}
                                  onChange={(e) => setEditingPoem({ ...editingPoem, imageOpacity: parseFloat(e.target.value) })}
                                  className="w-full h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-stone-800"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={handleSavePoem}
                        disabled={isGenerating || !editingPoem.title || !editingPoem.content}
                        className="flex items-center justify-center w-full gap-4 py-6 text-sm font-bold tracking-[0.3em] uppercase transition-all bg-stone-800 text-white rounded-[2rem] hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed shadow-xl"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            AI가 이미지를 생성하고 있습니다...
                          </>
                        ) : (
                          <>
                            {editingPoem.id ? <Save className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                            {editingPoem.id ? '시 수정 완료' : '시집에 수록하기'}
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* List Section */}
                  <div className="lg:col-span-5 space-y-8">
                    <div className="flex items-center justify-between px-4">
                      <h2 className="text-[10px] font-bold tracking-[0.4em] uppercase text-stone-400">수록된 시 목록 ({poems.length})</h2>
                      <span className="text-[10px] text-stone-300 font-mono">DRAG TO REORDER</span>
                    </div>
                    
                    <div className="space-y-4 max-h-[800px] overflow-y-auto pr-4 custom-scrollbar">
                      {poems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-96 border-2 border-dashed border-stone-200 rounded-[3rem] text-stone-300 bg-white/30 backdrop-blur-sm">
                          <Book className="w-12 h-12 mb-6 opacity-10" />
                          <p className="text-sm italic font-light tracking-widest">첫 번째 시를 작성해보세요</p>
                        </div>
                      ) : (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={handleDragEnd}
                        >
                          <SortableContext
                            items={poems.map(p => p.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-4">
                              {poems.map((poem) => (
                                <SortablePoemItem 
                                  key={poem.id} 
                                  poem={poem} 
                                  onRemove={removePoem}
                                  onEdit={handleEditPoem}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="preview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`relative w-full transition-all duration-500 ${isFullscreen ? 'h-screen' : 'h-[calc(100vh-6rem)]'}`}
              >
                {poems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-stone-400">
                    <p className="text-xl italic">시집에 내용이 없습니다.</p>
                    <button onClick={() => setCurrentView('editor')} className="mt-4 text-sm underline underline-offset-4 hover:text-stone-600">에디터로 돌아가기</button>
                  </div>
                ) : (
                  <div className="flex h-full">
                    {/* Book Content */}
                    <div id="book-preview-container" className="relative flex-1 overflow-hidden bg-stone-950">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={poems[activePoemIndex].id}
                          initial={{ opacity: 0, scale: 1.05 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 1.5, ease: "easeOut" }}
                          className="relative w-full h-full"
                        >
                          <div 
                            className="absolute inset-0 bg-center bg-cover"
                            style={{ 
                              backgroundImage: `url(${poems[activePoemIndex].imageUrl})`,
                              opacity: poems[activePoemIndex].imageOpacity ?? settings.photoOpacity
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40" />
                          
                          {/* Floating Toolbar */}
                          <div className={`absolute top-4 md:top-8 left-1/2 -translate-x-1/2 z-30 flex flex-wrap justify-center items-center gap-2 p-2 w-[95%] md:w-auto bg-black/80 backdrop-blur-md border border-white/10 rounded-2xl md:rounded-full shadow-2xl transition-all duration-500 ${isFullscreen ? '-translate-y-24 opacity-0' : 'translate-y-0 opacity-100'}`}>
                            <div className="flex items-center gap-1 px-2 border-r border-white/10">
                              {(['sm', 'base', 'lg', 'xl', '2xl', '3xl'] as Poem['fontSize'][]).map(size => (
                                <button
                                  key={size}
                                  onClick={() => handleUpdatePoemStyle(poems[activePoemIndex].id, { fontSize: size })}
                                  className={`w-8 h-8 flex items-center justify-center rounded-full transition-all text-[10px] uppercase font-bold ${
                                    (poems[activePoemIndex].fontSize || settings.defaultFontSize) === size ? 'bg-white text-black' : 'text-stone-400 hover:text-white'
                                  }`}
                                >
                                  {size}
                                </button>
                              ))}
                            </div>
                            <div className="flex items-center gap-1 px-2 border-r border-white/10">
                              <button
                                onClick={() => handleUpdatePoemStyle(poems[activePoemIndex].id, { textAlign: 'left' })}
                                className={`p-2 rounded-full transition-all ${(poems[activePoemIndex].textAlign || 'center') === 'left' ? 'bg-white text-black' : 'text-stone-400 hover:text-white'}`}
                              >
                                <AlignLeft className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleUpdatePoemStyle(poems[activePoemIndex].id, { textAlign: 'center' })}
                                className={`p-2 rounded-full transition-all ${(poems[activePoemIndex].textAlign || 'center') === 'center' ? 'bg-white text-black' : 'text-stone-400 hover:text-white'}`}
                              >
                                <AlignCenter className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleUpdatePoemStyle(poems[activePoemIndex].id, { textAlign: 'right' })}
                                className={`p-2 rounded-full transition-all ${(poems[activePoemIndex].textAlign || 'center') === 'right' ? 'bg-white text-black' : 'text-stone-400 hover:text-white'}`}
                              >
                                <AlignRight className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="flex items-center gap-1 px-2 border-r border-white/10">
                              <select 
                                value={poems[activePoemIndex].fontFamily || 'Noto Serif KR'}
                                onChange={(e) => handleUpdatePoemStyle(poems[activePoemIndex].id, { fontFamily: e.target.value })}
                                className="bg-transparent text-[10px] text-stone-400 hover:text-white focus:outline-none cursor-pointer uppercase tracking-widest font-bold"
                              >
                                {AVAILABLE_FONTS.map(font => (
                                  <option key={font.id} value={font.id} className="bg-stone-900 text-white">
                                    {font.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button
                              onClick={() => handleRegenerateImage(poems[activePoemIndex])}
                              disabled={isGenerating}
                              className="p-2 text-stone-400 hover:text-white transition-all disabled:opacity-50 border-r border-white/10"
                              title="이미지 재생성"
                            >
                              <Wand2 className={`w-4 h-4 ${isGenerating ? 'animate-pulse' : ''}`} />
                            </button>
                            <button
                              onClick={() => setIsFullscreen(!isFullscreen)}
                              className="p-2 text-stone-400 hover:text-white transition-all border-r border-white/10"
                              title={isFullscreen ? "전체화면 종료" : "전체화면 보기"}
                            >
                              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => setShowExportModal(true)}
                              className="p-2 text-stone-400 hover:text-white transition-all border-r border-white/10"
                              title="파일로 저장"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                const btn = document.getElementById('save-feedback');
                                if (btn) {
                                  btn.innerText = '저장됨';
                                  setTimeout(() => btn.innerText = '저장', 2000);
                                }
                              }}
                              className="px-4 py-1 text-[10px] font-bold tracking-widest uppercase bg-white text-black rounded-full hover:bg-stone-200 transition-all"
                            >
                              <span id="save-feedback">저장</span>
                            </button>
                          </div>

                          {/* Exit Fullscreen Button (only visible when fullscreen) */}
                          {isFullscreen && (
                            <button 
                              onClick={() => setIsFullscreen(false)}
                              className="absolute top-8 right-8 z-50 p-4 bg-black/40 backdrop-blur-md text-white rounded-full hover:bg-black/60 transition-all"
                              title="전체화면 종료"
                            >
                              <Minimize2 className="w-6 h-6" />
                            </button>
                          )}

                          <div className="relative w-full h-full overflow-y-auto custom-scrollbar">
                            <div className={`flex flex-col items-center justify-center min-h-full pt-32 pb-32 md:py-32 px-6 md:px-12 max-w-4xl mx-auto text-${poems[activePoemIndex].textAlign || 'center'}`} style={{ fontFamily: `'${poems[activePoemIndex].fontFamily || 'Noto Serif KR'}', serif` }}>
                              <motion.h2 
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5, duration: 1 }}
                                className="mb-12 text-5xl font-bold tracking-[0.3em] uppercase text-white"
                              >
                                {poems[activePoemIndex].title}
                              </motion.h2>
                              <motion.div 
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 1, duration: 1.2 }}
                                className={`leading-loose text-stone-100 whitespace-pre-wrap font-light text-${poems[activePoemIndex].fontSize || settings.defaultFontSize}`}
                              >
                                {poems[activePoemIndex].content}
                              </motion.div>
                            </div>
                          </div>
                        </motion.div>
                      </AnimatePresence>

                      {/* Controls */}
                      <div className={`absolute bottom-6 md:bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-8 z-20 transition-all duration-500`}>
                        <button 
                          onClick={() => setActivePoemIndex(prev => Math.max(0, prev - 1))}
                          disabled={activePoemIndex === 0}
                          className="p-3 transition-all rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-20 text-white shadow-lg"
                        >
                          <ChevronLeft className="w-6 h-6" />
                        </button>
                        <span className="text-xs tracking-[0.5em] text-stone-500 uppercase whitespace-nowrap bg-black/20 px-4 py-2 rounded-full backdrop-blur-sm">
                          {activePoemIndex + 1} / {poems.length}
                        </span>
                        <button 
                          onClick={() => setActivePoemIndex(prev => Math.min(poems.length - 1, prev + 1))}
                          disabled={activePoemIndex === poems.length - 1}
                          className="p-3 transition-all rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-20 text-white shadow-lg"
                        >
                          <ChevronRight className="w-6 h-6" />
                        </button>
                      </div>

                      {/* Copyright Overlay */}
                      <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none z-10">
                        <p className="text-[8px] tracking-[0.4em] text-white/20 uppercase">
                          © ggummana2@gmail.com | Version {settings.version}
                        </p>
                      </div>
                    </div>

                    {/* Sidebar Navigation */}
                    <div className="w-64 border-l border-stone-800 bg-stone-950 p-8 hidden md:block overflow-y-auto">
                      <h3 className="mb-8 text-[10px] font-bold tracking-[0.3em] uppercase text-stone-600">수록 시 목록</h3>
                      <div className="space-y-4">
                        {poems.map((poem, idx) => (
                          <button
                            key={poem.id}
                            onClick={() => setActivePoemIndex(idx)}
                            className={`block w-full text-right text-sm transition-all hover:text-white ${
                              activePoemIndex === idx ? 'text-white translate-x-[-4px]' : 'text-stone-600'
                            }`}
                          >
                            <span className="mr-2 text-[10px] opacity-30">{String(idx + 1).padStart(2, '0')}</span>
                            {poem.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>

      {/* Book Modal */}
      <AnimatePresence>
        {showBookModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-4xl max-h-[90vh] grid grid-cols-1 md:grid-cols-2 gap-0 bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-stone-200"
            >
              {/* Left: Preview */}
              <div className="relative bg-stone-100 aspect-[3/4] md:aspect-auto flex items-center justify-center overflow-hidden shrink-0">
                {coverPreviewUrl ? (
                  <motion.img 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    src={coverPreviewUrl} 
                    alt="Cover Preview" 
                    className="absolute inset-0 w-full h-full object-cover" 
                  />
                ) : editingBook.id && books.find(b => b.id === editingBook.id)?.coverImageUrl ? (
                  <img 
                    src={books.find(b => b.id === editingBook.id)?.coverImageUrl} 
                    alt="Current Cover" 
                    className="absolute inset-0 w-full h-full object-cover" 
                  />
                ) : (
                  <div className="flex flex-col items-center gap-4 text-stone-300">
                    <Book className="w-24 h-24 opacity-20" />
                    <p className="text-sm tracking-widest uppercase font-light">표지 미리보기</p>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-12 left-0 right-0 px-8 text-center text-white">
                  <h3 className="text-3xl font-bold tracking-tight mb-2">{editingBook.title || '시집 제목'}</h3>
                  <p className="text-xs uppercase tracking-[0.3em] opacity-60">{IMAGE_STYLES.find(s => s.id === editingBook.style)?.label} 스타일</p>
                </div>
              </div>

              {/* Right: Form */}
              <div className="p-8 md:p-12 flex flex-col justify-center space-y-8 overflow-y-auto">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold tracking-widest uppercase text-stone-400">시집 제목</label>
                    <input 
                      type="text"
                      value={editingBook.title}
                      onChange={(e) => setEditingBook({ ...editingBook, title: e.target.value })}
                      placeholder="시집 제목을 입력하세요"
                      className="w-full px-0 py-3 bg-transparent border-b border-stone-200 focus:border-stone-800 focus:outline-none transition-colors text-xl"
                    />
                  </div>
                  
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold tracking-widest uppercase text-stone-400">표지 생성 스타일</label>
                    <div className="grid grid-cols-3 gap-2">
                      {IMAGE_STYLES.map(style => (
                        <button
                          key={style.id}
                          onClick={() => { setEditingBook({ ...editingBook, style: style.id }); setCoverPreviewUrl(null); }}
                          className={`p-3 text-[10px] rounded-xl border transition-all ${editingBook.style === style.id ? 'bg-stone-800 text-white border-stone-800' : 'bg-stone-50 text-stone-500 border-stone-200 hover:border-stone-400'}`}
                        >
                          {style.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 pt-4">
                    <button 
                      onClick={handleGeneratePreviewCover}
                      disabled={isGenerating || !editingBook.title}
                      className="w-full py-4 bg-stone-100 text-stone-800 text-xs font-bold tracking-widest uppercase rounded-2xl hover:bg-stone-200 disabled:opacity-50 flex items-center justify-center gap-2 border border-stone-200"
                    >
                      {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                      표지 이미지 생성하기
                    </button>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => { setShowBookModal(false); setCoverPreviewUrl(null); }}
                        className="py-4 text-xs font-bold tracking-widest uppercase text-stone-400 hover:text-stone-600 border border-transparent"
                      >
                        취소
                      </button>
                      <button 
                        onClick={handleSaveBook}
                        disabled={isGenerating || !editingBook.title}
                        className="py-4 bg-stone-800 text-white text-xs font-bold tracking-widest uppercase rounded-2xl hover:bg-black disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                      >
                        {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {editingBook.id ? '수정 완료' : '시집 저장하기'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Export Modal */}
      <AnimatePresence>
        {showExportModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-md p-8 border bg-stone-900 border-stone-800 rounded-2xl"
            >
              <h2 className="mb-2 text-2xl font-light tracking-widest uppercase text-white">Save Anthology</h2>
              <p className="mb-8 text-sm text-stone-400">저장 형식을 선택해주세요.</p>
              
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => { exportAsHTML(); setShowExportModal(false); }}
                  className="flex flex-col items-center justify-center gap-4 p-6 transition-all border bg-stone-800/50 border-stone-700 rounded-xl hover:border-stone-400 group"
                >
                  <FileCode className="w-8 h-8 text-stone-300 group-hover:text-white" />
                  <span className="text-xs font-bold tracking-widest uppercase text-white">HTML5</span>
                </button>
                <button 
                  onClick={() => { exportAsEPUB(); setShowExportModal(false); }}
                  className="flex flex-col items-center justify-center gap-4 p-6 transition-all border bg-stone-800/50 border-stone-700 rounded-xl hover:border-stone-400 group"
                >
                  <Download className="w-8 h-8 text-stone-300 group-hover:text-white" />
                  <span className="text-xs font-bold tracking-widest uppercase text-white">EPUB</span>
                </button>
                <button 
                  onClick={() => { exportAsPDF(); setShowExportModal(false); }}
                  className="flex flex-col items-center justify-center gap-4 p-6 transition-all border bg-stone-800/50 border-stone-700 rounded-xl hover:border-stone-400 group"
                >
                  <FileText className="w-8 h-8 text-stone-300 group-hover:text-white" />
                  <span className="text-xs font-bold tracking-widest uppercase text-white">PDF</span>
                </button>
                <button 
                  onClick={() => { exportAsDOC(); setShowExportModal(false); }}
                  className="flex flex-col items-center justify-center gap-4 p-6 transition-all border bg-stone-800/50 border-stone-700 rounded-xl hover:border-stone-400 group"
                >
                  <FileText className="w-8 h-8 text-stone-300 group-hover:text-white" />
                  <span className="text-xs font-bold tracking-widest uppercase text-white">DOC</span>
                </button>
              </div>

              <button 
                onClick={() => setShowExportModal(false)}
                className="w-full mt-8 py-3 text-xs tracking-widest uppercase text-stone-500 hover:text-stone-300"
              >
                Cancel
              </button>
            </motion.div>
          </div>
        )}
        {confirmDelete && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-sm p-8 bg-stone-900 border border-stone-800 rounded-[2rem] text-center shadow-2xl"
            >
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-serif font-bold text-white mb-2">
                {confirmDelete.type === 'book' ? '시집 삭제' : '시 삭제'}
              </h3>
              <p className="text-stone-400 text-sm mb-8 leading-relaxed">
                {confirmDelete.type === 'book' 
                  ? '이 시집과 포함된 모든 시를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.' 
                  : '이 시를 정말로 삭제하시겠습니까?'}
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 py-4 text-xs font-bold tracking-widest uppercase text-stone-400 hover:text-white transition-colors"
                >
                  취소
                </button>
                <button 
                  onClick={executeDelete}
                  className="flex-1 py-4 bg-red-500 text-white rounded-2xl text-xs font-bold tracking-widest uppercase hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                >
                  삭제하기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #292524;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #44403c;
        }
      `}</style>
    </div>
  );
}
