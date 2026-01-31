const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service role key for backend operations
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Get bucket name from environment
const BUCKET_NAME = process.env.SUPABASE_BUCKET_NAME || 'user-files';

// Helper function to ensure bucket exists
const ensureBucketExists = async () => {
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.error('❌ Error listing buckets:', error.message);
      return false;
    }

    const bucketExists = buckets.some(bucket => bucket.name === BUCKET_NAME);
    
    if (!bucketExists) {
      console.log(`📦 Creating bucket: ${BUCKET_NAME}`);
      const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: false, // Private bucket
        fileSizeLimit: 104857600 // 100MB
      });
      
      if (createError) {
        console.error('❌ Error creating bucket:', createError.message);
        return false;
      }
      console.log(`✅ Bucket created: ${BUCKET_NAME}`);
    } else {
      console.log(`✅ Supabase bucket ready: ${BUCKET_NAME}`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Supabase bucket setup error:', error.message);
    return false;
  }
};

module.exports = {
  supabase,
  BUCKET_NAME,
  ensureBucketExists
};
