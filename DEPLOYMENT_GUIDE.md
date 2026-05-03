# EduKar Portal Deployment Guide 🚀

This project is structured for high scalability and real-time document management. Follow these steps to deploy to **Render** and **Cloudinary**.

## 1. Cloudinary Setup (For PDFs & Images)
1. Sign up at [Cloudinary.com](https://cloudinary.com).
2. Go to your **Dashboard**.
3. Copy your `Cloud Name`, `API Key`, and `API Secret`.
4. Update these in your `backend/.env` file or Render Environment Variables.

## 2. GitHub Deployment
If you haven't pushed yet, run these commands in the root directory:
```powershell
git remote add origin [YOUR_GITHUB_REPO_URL]
git branch -M main
git push -u origin main
```

## 3. Render Deployment (Backend)
1. **New Web Service** on Render.
2. Connect your GitHub Repo.
3. **Root Directory**: `backend`
4. **Build Command**: `npm install`
5. **Start Command**: `node server.js`
6. **Environment Variables**:
   - `MONGO_URI`: (Copy from your `.env`)
   - `JWT_SECRET`: (Copy from your `.env`)
   - `NODE_ENV`: `production`
   - `CLOUDINARY_CLOUD_NAME`: (Your Cloudinary Name)
   - `CLOUDINARY_API_KEY`: (Your Cloudinary Key)
   - `CLOUDINARY_API_SECRET`: (Your Cloudinary Secret)

## 4. Render Deployment (Admin Panel)
1. **New Static Site** on Render.
2. **Root Directory**: `admin-panel`
3. **Build Command**: `npm run build`
4. **Publish Directory**: `dist`
5. **Environment Variables**:
   - `VITE_API_BASE_URL`: `https://your-backend-url.onrender.com/api`

## Important Notes:
- **PDF Uploads**: Ensure `CLOUDINARY_API_KEY` is set on Render, otherwise uploads will fail or be stored locally (and lost on restart).
- **CORS**: The backend is configured to allow all origins by default, but for production, you can restrict it in `server.js`.
- **IP Change**: If testing locally with a mobile device, remember to update `user_app/lib/config/api_config.dart` with your Computer's LAN IP.
