import { useState } from 'react'
import heroImg from './assets/hero.png'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import './App.css'
import Navbar from "./components/Navbar";
import { BrowserRouter, Routes, Route } from "react-router-dom";



import Home from "./pages/Home";
import Matches from "./pages/Matches";
import Booking from "./pages/Booking";
import BookingHistory from "./pages/BookingHistory";
import { Link } from "react-router-dom";






function App() {
  return (
    <BrowserRouter>

      <Navbar />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/matches" element={<Matches />} />
        <Route path="/booking" element={<Booking />} />
        <Route path="/history" element={<BookingHistory />} />
      </Routes>

    </BrowserRouter>
  );
}


export default App