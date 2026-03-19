# Arousha1

## Overview
A React + TypeScript web app for interactive learning/practice and session-based activities.
It integrates Firebase (Hosting/Functions/Firestore/Storage) and generates/reads PDFs in the browser.

## Tech Stack
- React (Create React App) + TypeScript
- Tailwind CSS (PostCSS + Autoprefixer)
- Firebase: Hosting, Cloud Functions (Node 20), Firestore rules, Storage rules
- Routing: React Router
- 3D / motion: Three.js (`@react-three/fiber`, `@react-three/drei`), Framer Motion, GSAP
- PDFs: `pdf-lib`, `pdfjs-dist`

## Features
- Auth-gated experience (see `src/auth` and `src/components/RequireAuth.tsx`)
- Session generation/scoring and storage utilities (see `src/lib`)
- PDF creation and in-browser viewing
- Firebase Hosting deployment + Cloud Functions backend
- Interactive UI with 3D and motion components

## Demo
- Live link: https://arousha.art

## Architecture
```mermaid
flowchart LR
	U[User Browser] -->|React UI| FE[Frontend (React + TS)]
	FE -->|Auth / App data| FS[(Firestore)]
	FE -->|Session JSON / assets| ST[(Cloud Storage)]
	FE -->|Callable/HTTP| CF[Cloud Functions (Node.js)]
	FE -->|Hosted static build| FH[Firebase Hosting]
```
