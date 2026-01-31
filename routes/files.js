const express = require('express');
const router = express.Router();
const multer = require('multer');
const File = require('../models/File');
const authMiddleware = require('../middleware/auth');
const { supabase, BUCKET_NAME } = require('../config/supabase');

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 104857600 // 100MB default
  }
});

// @route   GET /api/files/shared/:token
// @desc    Get shared file info (Public)
// @access  Public
router.get('/shared/:token', async (req, res) => {
  try {
    const file = await File.findOne({ shareToken: req.params.token, isShared: true, isDeleted: false });

    if (!file) {
      return res.status(404).json({ success: false, message: 'File is not available or link has expired.' });
    }

    // Generate download/preview URL
    let signedUrl = null;
    if (!file.isFolder) {
      const { data } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(file.supabasePath, 3600);
      signedUrl = data?.signedUrl;
    }

    res.status(200).json({
      success: true,
      data: file,
      downloadUrl: signedUrl
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error retrieving shared file.', error: error.message });
  }
});

// Apply auth middleware to all routes
router.use(authMiddleware);

// @route   GET /api/files
// @desc    Get all files and folders for current user
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { parentFolder } = req.query;

    const query = {
      owner: req.user._id
    };

    // If parentFolder is specified, get files in that folder
    // Otherwise get root level files (parentFolder: null)
    // ALWAYS exclude deleted files unless explicitly asked for (trash view)
    
    if (req.query.trash === 'true') {
      // Get only deleted files
      query.isDeleted = true;
    } else if (req.query.starred === 'true') {
      // Get only starred files (that are NOT deleted)
      query.isStarred = true;
      query.isDeleted = false;
    } else {
      // Normal view: Not deleted
      query.isDeleted = false;
      
      // Handle parent folder navigation
      if (parentFolder) {
        query.parentFolder = parentFolder;
      } else {
        query.parentFolder = null;
      }
    }

    // Search filter
    if (req.query.search) {
      query.name = { $regex: req.query.search, $options: 'i' };
    }

    // Type filter
    if (req.query.type) {
      if (req.query.type === 'folder') {
        query.isFolder = true;
      } else {
        query.isFolder = false;
        // Map common types to mime types or extensions if needed
        // For now, we'll rely on the frontend to pass simpler types or handle specific mimes
        if (req.query.type === 'image') query.mimeType = { $regex: '^image/' };
        if (req.query.type === 'video') query.mimeType = { $regex: '^video/' };
        if (req.query.type === 'pdf') query.mimeType = 'application/pdf';
      }
    }

    // Sorting
    let sort = { isFolder: -1, name: 1 }; // Default
    if (req.query.sort) {
      switch (req.query.sort) {
        case 'name':
          sort = { isFolder: -1, name: 1 };
          break;
        case 'date':
          sort = { isFolder: -1, createdAt: -1 };
          break;
        case 'size':
          sort = { isFolder: -1, size: -1 };
          break;
      }
    }

    const files = await File.find(query)
      .sort(sort)
      .select('-__v');

    res.status(200).json({
      success: true,
      count: files.length,
      data: files
    });
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve files.',
      error: error.message
    });
  }
});

// @route   POST /api/files/folder
// @desc    Create a new folder
// @access  Private
router.post('/folder', async (req, res) => {
  try {
    const { name, parentFolder } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Folder name is required.'
      });
    }

    // Build path
    let path = `/${name}`;
    if (parentFolder) {
      const parent = await File.findOne({
        _id: parentFolder,
        owner: req.user._id,
        isFolder: true
      });

      if (!parent) {
        return res.status(404).json({
          success: false,
          message: 'Parent folder not found.'
        });
      }

      path = `${parent.path}/${name}`;
    }

    // Check if folder with same name exists in same location
    const existingFolder = await File.findOne({
      owner: req.user._id,
      name: name.trim(),
      parentFolder: parentFolder || null,
      isFolder: true
    });

    if (existingFolder) {
      return res.status(400).json({
        success: false,
        message: 'A folder with this name already exists in this location.'
      });
    }

    // Create folder
    const folder = await File.create({
      name: name.trim(),
      type: 'folder',
      isFolder: true,
      path,
      owner: req.user._id,
      parentFolder: parentFolder || null,
      size: 0
    });

    res.status(201).json({
      success: true,
      message: 'Folder created successfully.',
      data: folder
    });
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create folder.',
      error: error.message
    });
  }
});

// @route   POST /api/files/upload
// @desc    Upload a file
// @access  Private
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded.'
      });
    }

    const { parentFolder } = req.body;

    // Build path
    let path = `/${req.file.originalname}`;
    if (parentFolder) {
      const parent = await File.findOne({
        _id: parentFolder,
        owner: req.user._id,
        isFolder: true
      });

      if (!parent) {
        return res.status(404).json({
          success: false,
          message: 'Parent folder not found.'
        });
      }

      path = `${parent.path}/${req.file.originalname}`;
    }

    // Generate unique Supabase path: userId/timestamp-filename
    const timestamp = Date.now();
    const supabasePath = `${req.user._id}/${timestamp}-${req.file.originalname}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(supabasePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload file to storage.',
        error: uploadError.message
      });
    }

    // Save file metadata to database
    const file = await File.create({
      name: req.file.originalname,
      type: 'file',
      isFolder: false,
      size: req.file.size,
      mimeType: req.file.mimetype,
      path,
      supabasePath,
      owner: req.user._id,
      parentFolder: parentFolder || null
    });

    res.status(201).json({
      success: true,
      message: 'File uploaded successfully.',
      data: file
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload file.',
      error: error.message
    });
  }
});

// @route   GET /api/files/:id/download
// @desc    Get download URL for a file
// @access  Private
router.get('/:id/download', async (req, res) => {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found.'
      });
    }

    // Check ownership
    if (!file.isOwnedBy(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not own this file.'
      });
    }

    // Can't download folders
    if (file.isFolder) {
      return res.status(400).json({
        success: false,
        message: 'Cannot download folders.'
      });
    }

    // Generate signed URL (valid for 1 hour)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(file.supabasePath, 3600);

    if (signedUrlError) {
      console.error('Signed URL error:', signedUrlError);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate download URL.',
        error: signedUrlError.message
      });
    }

    res.status(200).json({
      success: true,
      data: {
        downloadUrl: signedUrlData.signedUrl,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.mimeType
      }
    });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get download URL.',
      error: error.message
    });
  }
});

// @route   GET /api/files/folder/:id/download
// @desc    Download folder as ZIP
// @access  Private
router.get('/folder/:id/download', async (req, res) => {
  try {
    const folderId = req.params.id;
    const folder = await File.findOne({ _id: folderId, owner: req.user._id, isFolder: true });

    if (!folder) {
      return res.status(404).json({ success: false, message: 'Folder not found.' });
    }

    // Initialize archive
    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 9 } });

    res.attachment(`${folder.name}.zip`);
    archive.pipe(res);

    // Recursive function to add files to archive
    async function addFolderToArchive(folderId, folderPath) {
      const files = await File.find({ parentFolder: folderId, owner: req.user._id, isDeleted: false });

      for (const file of files) {
        if (file.isFolder) {
          // Append empty directory if needed, or just recurse
          archive.append(null, { name: folderPath + file.name + '/' });
          await addFolderToArchive(file._id, folderPath + file.name + '/');
        } else {
          // Download file from Supabase and append to archive
          const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .download(file.supabasePath);

          if (!error && data) {
            // Convert Blob/Buffer to stream or buffer
            const buffer = Buffer.from(await data.arrayBuffer());
            archive.append(buffer, { name: folderPath + file.name });
          }
        }
      }
    }

    await addFolderToArchive(folderId, '');
    await archive.finalize();

  } catch (error) {
    console.error('Folder download error:', error);
    // If headers already sent (streaming started), we can't send JSON error
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to download folder.' });
    }
  }
});

// @route   PUT /api/files/:id/star
// @desc    Toggle star status
// @access  Private
router.put('/:id/star', async (req, res) => {
  try {
    const file = await File.findOne({ _id: req.params.id, owner: req.user._id });

    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found.' });
    }

    file.isStarred = !file.isStarred;
    await file.save();

    res.status(200).json({
      success: true,
      data: file
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating star status.', error: error.message });
  }
});

// @route   PUT /api/files/:id/restore
// @desc    Restore file from trash
// @access  Private
router.put('/:id/restore', async (req, res) => {
  try {
    const file = await File.findOne({ _id: req.params.id, owner: req.user._id });

    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found.' });
    }

    file.isDeleted = false;
    file.deletedAt = null;
    await file.save();

    res.status(200).json({
      success: true,
      message: 'File restored successfully.',
      data: file
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error restoring file.', error: error.message });
  }
});

// @route   DELETE /api/files/:id
// @desc    Soft delete a file (Move to Trash)
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found.' });
    }

    if (!file.isOwnedBy(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    // Soft Delete
    file.isDeleted = true;
    file.deletedAt = Date.now();
    await file.save();

    res.status(200).json({
      success: true,
      message: 'File moved to trash.'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete.', error: error.message });
  }
});

// @route   DELETE /api/files/:id/permanent
// @desc    Permanently delete a file
// @access  Private
router.delete('/:id/permanent', async (req, res) => {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found.' });
    }

    if (!file.isOwnedBy(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    // If it's a file, delete from Supabase
    if (!file.isFolder && file.supabasePath) {
      const { error: deleteError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([file.supabasePath]);

      if (deleteError) {
        console.error('Supabase delete error:', deleteError);
      }
    }

    // If it's a folder, delete all contents recursively
    if (file.isFolder) {
      await deleteFolder(file._id, req.user._id);
    }

    // Delete from database
    await File.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'File permanently deleted.'
    });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete permanently.',
      error: error.message
    });
  }
});

// Helper function to recursively delete folder contents
async function deleteFolder(folderId, userId) {
  // Get all items in this folder
  const items = await File.find({
    parentFolder: folderId,
    owner: userId
  });

  for (const item of items) {
    if (item.isFolder) {
      // Recursively delete subfolders
      await deleteFolder(item._id, userId);
    } else if (item.supabasePath) {
      // Delete file from Supabase
      await supabase.storage
        .from(BUCKET_NAME)
        .remove([item.supabasePath]);
    }
    
    // Delete from database
    await File.findByIdAndDelete(item._id);
  }
}

// @route   PUT /api/files/:id/share
// @desc    Toggle file sharing (Public Link)
// @access  Private
router.put('/:id/share', async (req, res) => {
  try {
    const file = await File.findOne({ _id: req.params.id, owner: req.user._id });

    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found.' });
    }

    if (file.isShared) {
      // Turn off sharing
      file.isShared = false;
      file.shareToken = null;
    } else {
      // Turn on sharing - Generate unique token
      const crypto = require('crypto');
      file.isShared = true;
      file.shareToken = crypto.randomBytes(16).toString('hex');
    }

    await file.save();

    res.status(200).json({
      success: true,
      data: file,
      shareLink: file.isShared ? `${process.env.FRONTEND_URL || 'http://localhost:5173'}/shared/${file.shareToken}` : null
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating share status.', error: error.message });
  }
});



module.exports = router;
