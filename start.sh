#!/bin/bash
export DATABASE_URL='postgresql://neondb_owner:npg_bFmNJVz82KAP@ep-frosty-cloud-advca7qx-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
export SESSION_SECRET='my-super-secret-key-change-this-later-12345'
npm run dev
