import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import MapMaker from './ui/maker/MapMaker';
import WorldManager from './ui/worlds/WorldManager';
import './styles/global.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { I18nProvider } from './ui/i18n';

const root = createRoot(document.getElementById('root')!);
root.render(
	<I18nProvider>
		<BrowserRouter>
			<Routes>
				<Route path="/" element={<App />} />
				<Route path="/world/:worldId" element={<App />} />
				<Route path="/maker" element={<MapMaker />} />
				<Route path="/maker/:id" element={<MapMaker />} />
				<Route path="/worlds" element={<WorldManager />} />
			</Routes>
		</BrowserRouter>
	</I18nProvider>
);



