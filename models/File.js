const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'File name is required'],
    trim: true
  },
  type: {
    type: String,
    enum: ['file', 'folder'],
    required: true
  },
  size: {
    type: Number,
    default: 0 // 0 for folders
  },
  mimeType: {
    type: String,
    default: null // null for folders
  },
  path: {
    type: String,
    required: true // Virtual path in the app (e.g., /Documents/Report.pdf)
  },
  supabasePath: {
    type: String,
    default: null // Actual path in Supabase storage (null for folders)
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  parentFolder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File',
    default: null // null means root level
  },
  isFolder: {
    type: Boolean,
    default: false
  },
  isStarred: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  isShared: {
    type: Boolean,
    default: false
  },
  shareToken: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Index for share token
fileSchema.index({ shareToken: 1 });

// Index for faster queries
fileSchema.index({ owner: 1, parentFolder: 1 });
fileSchema.index({ owner: 1, type: 1 });

// Virtual for getting file extension
fileSchema.virtual('extension').get(function() {
  if (this.isFolder) return null;
  const parts = this.name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : null;
});

// Method to check if user owns this file
fileSchema.methods.isOwnedBy = function(userId) {
  return this.owner.toString() === userId.toString();
};

module.exports = mongoose.model('File', fileSchema);
