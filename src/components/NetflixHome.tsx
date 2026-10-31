import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Play,
  Info,
  Plus,
  Check,
  ChevronLeft,
  ChevronRight,
  Star,
  Film,
  Tv,
  Volume2,
  VolumeX,
  Sparkles,
  Flame,
  Clock,
  Layers,
  X,
  Globe,
  Smile,
  Clapperboard,
  Zap,
} from 'lucide-react';
import { ParsedFtpItem } from '../utils/ftpParser';
import { EnrichedMetadata, sortNewestFirst } from '../services/ftpClient';
import { MediaPosterCard } from './MediaPosterCard';
import { SeriesSeasonModal } from './SeriesSeasonModal';
import {
  SEED_HOLLYWOOD_CATALOG,
  SEED_BOLLYWOOD_CATALOG,
  SEED_SOUTH_CATALOG,
  SEED_ANIMATION_CATALOG,
  SEED_BANGLA_CATALOG,
  SEED_SERIES_CATALOG,
} from '../utils/seedData';

interface CinemaHomeProps {
  items: ParsedFtpItem[];
  isLoading: boolean;
  onSelectMedia: (item: ParsedFtpItem, meta?: EnrichedMetadata | null) => void;
  onPlayDirect: (item: ParsedFtpItem, meta?: EnrichedMetadata | null) => void;
  onOpenFolder?: (url: string, title: string) => void;
  watchlistSet: Set<string>;
  onToggleWatchlist: (item: ParsedFtpItem) => void;
  onNavigateSection?: (section: 'movies' | 'series') => void;
}

// Curated high-definition movies and series organized into 6 thematic 2-Day Spotlight Cycles
export interface FeaturedNewMovie {
  id: string;
  cleanTitle: string;
  year: number;
  imdbRating: string;
  quality: string;
  audioTag: string;
  genres: string[];
  plot: string;
  backdropUrl: string;
  thumbUrl: string;
  runtime: string;
  streamUrl: string;
}

// 6 Thematic Spotlight Collections that automatically rotate every 1-2 days (48 hours)
export const FEATURED_SPOTLIGHT_SETS: { name: string; tag: string; movies: FeaturedNewMovie[] }[] = [
  {
    name: 'Epic Action & Sci-Fi Blockbusters',
    tag: 'Hollywood Premieres',
    movies: [
      {
        id: 'feat-dune',
        cleanTitle: 'Dune',
        year: 2021,
        imdbRating: '8.0',
        quality: '1080p WEBRip • 5.1',
        audioTag: 'Dolby Atmos 5.1',
        genres: ['Action', 'Adventure', 'Sci-Fi'],
        plot: "Paul Atreides, a brilliant and gifted young man born into a great destiny beyond his understanding, must travel to the most dangerous planet in the universe to ensure the future of his family and his people.",
        backdropUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=300&auto=format&fit=crop&q=80',
        runtime: '2h 35m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/Dune%20(2021)%20%5b1080p%5d%20%5bWEBRip%5d%20%5b5.1%5d%20%5bYTS.MX%5d/Dune.2021.1080p.WEBRip.x264.AAC5.1-%5bYTS.MX%5d.mp4',
      },
      {
        id: 'feat-the-matrix',
        cleanTitle: 'The Matrix',
        year: 1999,
        imdbRating: '8.7',
        quality: '720p HD • YIFY',
        audioTag: 'English 5.1',
        genres: ['Action', 'Sci-Fi'],
        plot: 'When a beautiful stranger leads computer hacker Neo to a forbidding underworld, he discovers the shocking truth: the life he knows is the elaborate deception of an evil cyber-intelligence.',
        backdropUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=300&auto=format&fit=crop&q=80',
        runtime: '2h 16m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/The_Matrix_1999.720p_Brrip_x264-YIFY/The.Matrix.1999.720p.BrRip.264.YIFY.mp4',
      },
      {
        id: 'feat-world-war-z',
        cleanTitle: 'World War Z',
        year: 2013,
        imdbRating: '7.0',
        quality: '1080p BluRay',
        audioTag: 'Dolby 5.1',
        genres: ['Action', 'Adventure', 'Horror', 'Sci-Fi'],
        plot: 'Former United Nations employee Gerry Lane traverses the world in a race against time to stop a zombie pandemic that is toppling armies and governments and threatening humanity.',
        backdropUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=300&auto=format&fit=crop&q=80',
        runtime: '1h 56m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/World%20War%20Z%20(2013)%20%5b1080p%5d/World.War.Z.2013.1080p.BluRay.x264.YIFY.mp4',
      },
      {
        id: 'feat-v-for-vendetta',
        cleanTitle: 'V for Vendetta',
        year: 2006,
        imdbRating: '8.2',
        quality: '1080p BluRay',
        audioTag: 'Dolby 5.1',
        genres: ['Action', 'Drama', 'Sci-Fi'],
        plot: 'In a future British dystopian tyranny, a shadowy freedom fighter known only as V uses guerrilla tactics to fight the oppressive regime and liberate the people.',
        backdropUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300&auto=format&fit=crop&q=80',
        runtime: '2h 12m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/V%20for%20Vendetta%20(2006)%20%5b1080p%5d/V.For.Vendetta.2006.1080p.BrRip.x264.YIFY.mp4',
      },
      {
        id: 'feat-arrival',
        cleanTitle: 'Arrival',
        year: 2016,
        imdbRating: '7.9',
        quality: '1080p BluRay',
        audioTag: 'Dolby 5.1',
        genres: ['Drama', 'Mystery', 'Sci-Fi'],
        plot: 'A linguist is tasked by the military with translating the alien language after twelve mysterious extraterrestrial spacecraft appear around the globe.',
        backdropUrl: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=300&auto=format&fit=crop&q=80',
        runtime: '1h 56m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/Arrival%20(2016)%20%5b1080p%5d%20%5bYTS.AG%5d/Arrival.2016.1080p.BluRay.x264-%5bYTS.AG%5d.mp4',
      },
    ],
  },
  {
    name: 'Trending Global Web Series & TV Dramas',
    tag: 'Web Series Hits',
    movies: [
      {
        id: 'feat-squid-game',
        cleanTitle: 'Squid Game',
        year: 2024,
        imdbRating: '8.8',
        quality: '1080p WEB-DL',
        audioTag: 'Dual Audio (Eng + Kor)',
        genres: ['Action', 'Drama', 'Thriller'],
        plot: 'Hundreds of cash-strapped contestants accept an invitation to compete in children games for a tempting prize with deadly high stakes.',
        backdropUrl: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=300&auto=format&fit=crop&q=80',
        runtime: '9 Episodes',
        streamUrl: 'https://www.fradgify.kozow.com/media/tv/Squid.Game.S01.COMPLETE.DUBBED/Squid.Game.S01E01.DUBBED.720p.NF.WEBRip.x264-GalaxyTV.mkv',
      },
      {
        id: 'feat-chernobyl',
        cleanTitle: 'Chernobyl',
        year: 2019,
        imdbRating: '9.4',
        quality: '1080p BluRay',
        audioTag: 'English 5.1',
        genres: ['Drama', 'History', 'Thriller'],
        plot: 'In April 1986, an explosion at the Chernobyl nuclear power plant in the USSR becomes one of the world worst man-made catastrophes.',
        backdropUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=300&auto=format&fit=crop&q=80',
        runtime: '5 Episodes',
        streamUrl: 'https://www.fradgify.kozow.com/media/tv/Chernobyl.COMPLETE.Season.1.S01.1080p/Chernobyl.S01E01.1.23.45.1080p.AMZN.WEB-DL.x265-HETeam.mkv',
      },
      {
        id: 'feat-baby-reindeer',
        cleanTitle: 'Baby Reindeer',
        year: 2024,
        imdbRating: '8.6',
        quality: '1080p WEB-DL',
        audioTag: 'English 5.1',
        genres: ['Biography', 'Drama', 'Thriller'],
        plot: 'When a struggling comedian shows one act of kindness to a vulnerable woman, it unleashes a suffocating obsession that threatens to wreck their lives.',
        backdropUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300&auto=format&fit=crop&q=80',
        runtime: '7 Episodes',
        streamUrl: 'https://www.fradgify.kozow.com/media/tv/Baby.Reindeer.S01.1080p/Baby.Reindeer.S01E01.1080p.10bit.WEBRip.6CH.x265.HEVC-PSA.mkv',
      },
      {
        id: 'feat-money-heist',
        cleanTitle: 'Money Heist',
        year: 2021,
        imdbRating: '8.5',
        quality: '1080p HDR',
        audioTag: 'Dual Audio (Spa + Eng)',
        genres: ['Action', 'Crime', 'Drama'],
        plot: 'An unusual group of robbers attempt to carry out the most perfect robbery in Spanish history - stealing billions from the Royal Mint of Spain.',
        backdropUrl: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=300&auto=format&fit=crop&q=80',
        runtime: '10 Episodes',
        streamUrl: 'https://www.fradgify.kozow.com/media/tv/La.casa.de.papel.A.K.A.Money.Heist.SEASON.01.S01.COMPLETE/La.casa.de.papel.A.K.A.Money.Heist.S01E01.DUAL-AUDIO.SPA-ENG.720p.10bit.WEBRip.2CH.x265.HEVC-PSA.mkv',
      },
      {
        id: 'feat-silicon-valley',
        cleanTitle: 'Silicon Valley',
        year: 2020,
        imdbRating: '8.5',
        quality: '1080p WEB-DL',
        audioTag: 'English 5.1',
        genres: ['Comedy', 'Tech'],
        plot: 'Follows the struggle of Richard Hendricks, a Silicon Valley engineer trying to build his own compression company called Pied Piper.',
        backdropUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=300&auto=format&fit=crop&q=80',
        runtime: '8 Episodes',
        streamUrl: 'https://www.fradgify.kozow.com/media/tv/Silicon.Valley.S01.1080p/Silicon.Valley.S01E01.Minimum.Viable.Product.1080p.BluRay.x265.10bit.AAC.5.1-ImE%5bUTR%5d.mkv',
      },
    ],
  },
  {
    name: 'Critically Acclaimed Masterpieces & Oscar Winners',
    tag: 'Cinema Icons',
    movies: [
      {
        id: 'feat-wolf-of-wall-street',
        cleanTitle: 'The Wolf of Wall Street',
        year: 2013,
        imdbRating: '8.2',
        quality: '1080p BluRay',
        audioTag: 'Dolby 5.1',
        genres: ['Biography', 'Comedy', 'Crime'],
        plot: 'Based on the true story of Jordan Belfort, from his rise to a wealthy stock-broker living the high life to his fall involving crime, corruption and the federal government.',
        backdropUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&auto=format&fit=crop&q=80',
        runtime: '3h 00m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/The%20Wolf%20of%20Wall%20Street%20(2013)%20%5b1080p%5d/The.Wolf.of.Wall.Street.2013.1080p.BluRay.x264.YIFY.mp4',
      },
      {
        id: 'feat-whiplash',
        cleanTitle: 'Whiplash',
        year: 2014,
        imdbRating: '8.5',
        quality: '1080p BluRay',
        audioTag: 'Dolby 5.1',
        genres: ['Drama', 'Music'],
        plot: "A promising young drummer enrolls at a cut-throat music conservatory where his dreams of greatness are mentored by an instructor who will stop at nothing to realize a student's potential.",
        backdropUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80',
        runtime: '1h 46m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/Whiplash%20(2014)%20%5b1080p%5d/Whiplash.2014.1080p.BluRay.x264.YIFY.mp4',
      },
      {
        id: 'feat-the-truman-show',
        cleanTitle: 'The Truman Show',
        year: 1998,
        imdbRating: '8.2',
        quality: '1080p BluRay',
        audioTag: 'Dolby 5.1',
        genres: ['Comedy', 'Drama', 'Sci-Fi'],
        plot: 'An insurance salesman discovers his whole life is actually a reality TV show broadcast live to the entire world 24/7.',
        backdropUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=300&auto=format&fit=crop&q=80',
        runtime: '1h 43m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/The%20Truman%20Show%20(1998)%20%5b1080p%5d/The.Truman.Show.1998.1080p.BluRay.x264.YIFY.mp4',
      },
      {
        id: 'feat-the-big-short',
        cleanTitle: 'The Big Short',
        year: 2015,
        imdbRating: '7.8',
        quality: '1080p BluRay',
        audioTag: 'Dolby 5.1',
        genres: ['Biography', 'Comedy', 'Drama'],
        plot: 'In 2006-2007 a group of savvy investors betting against the United States mortgage market discover how flawed and corrupt the system is.',
        backdropUrl: 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=300&auto=format&fit=crop&q=80',
        runtime: '2h 10m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/The%20Big%20Short%20(2015)%20%5b1080p%5d%20%5bYTS.AG%5d/The.Big.Short.2015.1080p.BluRay.x264-%5bYTS.AG%5d.mp4',
      },
      {
        id: 'feat-children-of-men',
        cleanTitle: 'Children of Men',
        year: 2006,
        imdbRating: '7.9',
        quality: '1080p BluRay',
        audioTag: 'Dolby 5.1',
        genres: ['Action', 'Drama', 'Sci-Fi'],
        plot: 'In 2027, in a chaotic world in which women have become mysteriously infertile, a former activist agrees to help transport a miraculously pregnant woman to a sanctuary at sea.',
        backdropUrl: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=300&auto=format&fit=crop&q=80',
        runtime: '1h 49m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/Children%20of%20Men%20(2006)%20%5b1080p%5d/Children.of.Men.2006.1080p.BrRip.x264.BOKUTOX.YIFY.mp4',
      },
    ],
  },
  {
    name: 'Festival Champions & Modern Drama',
    tag: 'Award Winners',
    movies: [
      {
        id: 'feat-anora',
        cleanTitle: 'Anora',
        year: 2024,
        imdbRating: '8.0',
        quality: '1080p WEBRip',
        audioTag: 'Dolby 5.1',
        genres: ['Comedy', 'Drama', 'Romance'],
        plot: 'A young sex worker from Brooklyn gets her chance at a Cinderella story when she meets and marries the son of an oligarch.',
        backdropUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&auto=format&fit=crop&q=80',
        runtime: '2h 19m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/Anora%20(2024)%20%5b1080p%5d%20%5bWEBRip%5d%20%5b5.1%5d%20%5bYTS.MX%5d/Anora.2024.1080p.WEBRip.x264.AAC5.1-%5bYTS.MX%5d.mp4',
      },
      {
        id: 'feat-poor-things',
        cleanTitle: 'Poor Things',
        year: 2023,
        imdbRating: '7.9',
        quality: '1080p WEBRip',
        audioTag: 'Dolby 5.1',
        genres: ['Comedy', 'Drama', 'Romance'],
        plot: 'The incredible tale of Bella Baxter, a young woman brought back to life by the brilliant and unorthodox scientist Dr. Godwin Baxter.',
        backdropUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=300&auto=format&fit=crop&q=80',
        runtime: '2h 21m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/Poor%20Things%20(2023)%20%5b1080p%5d%20%5bWEBRip%5d%20%5b5.1%5d%20%5bYTS.MX%5d/Poor.Things.2023.1080p.WEBRip.x264.AAC5.1-%5bYTS.MX%5d.mp4',
      },
      {
        id: 'feat-eeaao',
        cleanTitle: 'Everything Everywhere All At Once',
        year: 2022,
        imdbRating: '7.8',
        quality: '1080p BluRay',
        audioTag: 'Dolby Atmos',
        genres: ['Action', 'Adventure', 'Comedy', 'Sci-Fi'],
        plot: 'A middle-aged Chinese immigrant is swept up into an insane adventure in which she alone can save existence by exploring other universes.',
        backdropUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&auto=format&fit=crop&q=80',
        runtime: '2h 19m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/Everything%20Everywhere%20All%20At%20Once%20(2022)%20%5b720p%5d%20%5bBluRay%5d%20%5bYTS.MX%5d/Everything.Everywhere.All.At.Once.2022.720p.BluRay.x264.AAC-%5bYTS.MX%5d.mp4',
      },
      {
        id: 'feat-coda',
        cleanTitle: 'CODA',
        year: 2021,
        imdbRating: '8.0',
        quality: '1080p BluRay',
        audioTag: 'Dolby 5.1',
        genres: ['Comedy', 'Drama', 'Music'],
        plot: 'As a child of deaf adults, Ruby is torn between pursuing her passion at Berklee College of Music and helping her family maintain their fishing business.',
        backdropUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80',
        runtime: '1h 51m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/CODA%20(2021)%20%5b1080p%5d%20%5bBluRay%5d%20%5b5.1%5d%20%5bYTS.MX%5d/CODA.2021.1080p.BluRay.x264.AAC5.1-%5bYTS.MX%5d.mp4',
      },
      {
        id: 'feat-asteroid-city',
        cleanTitle: 'Asteroid City',
        year: 2023,
        imdbRating: '6.5',
        quality: '1080p WEBRip',
        audioTag: 'Dolby 5.1',
        genres: ['Comedy', 'Drama', 'Romance'],
        plot: 'World-changing events spectacularly disrupt the itinerary of a Junior Stargazer/Space Cadet convention in an American desert town circa 1955.',
        backdropUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=300&auto=format&fit=crop&q=80',
        runtime: '1h 45m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/Asteroid%20City%20(2023)%20%5b1080p%5d%20%5bWEBRip%5d%20%5b5.1%5d%20%5bYTS.MX%5d/Asteroid.City.2023.1080p.WEBRip.x264.AAC5.1-%5bYTS.MX%5d.mp4',
      },
    ],
  },
  {
    name: 'Action, Comedy & Cult Classics',
    tag: 'Audience Favorites',
    movies: [
      {
        id: 'feat-21-jump-street',
        cleanTitle: '21 Jump Street',
        year: 2012,
        imdbRating: '7.2',
        quality: '1080p BluRay',
        audioTag: 'Dolby 5.1',
        genres: ['Action', 'Comedy', 'Crime'],
        plot: 'A pair of underachieving cops are sent back to a local high school to blend in and bring down a synthetic drug ring.',
        backdropUrl: 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=300&auto=format&fit=crop&q=80',
        runtime: '1h 49m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/21%20Jump%20Street%20(2012)%20%5b1080p%5d/21.Jump.Street.2012.1080p.BluRay.x264.YIFY.mp4',
      },
      {
        id: 'feat-22-jump-street',
        cleanTitle: '22 Jump Street',
        year: 2014,
        imdbRating: '7.0',
        quality: '1080p BluRay',
        audioTag: 'Dolby 5.1',
        genres: ['Action', 'Comedy', 'Crime'],
        plot: 'After making their way through high school twice, big changes are in store for officers Schmidt and Jenko when they go deep undercover at a local college.',
        backdropUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=300&auto=format&fit=crop&q=80',
        runtime: '1h 52m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/22%20Jump%20Street%20(2014)%20%5b1080p%5d/22.Jump.Street.2014.1080p.BluRay.x264.YIFY.mp4',
      },
      {
        id: 'feat-breakfast-club',
        cleanTitle: 'The Breakfast Club',
        year: 1985,
        imdbRating: '7.8',
        quality: '1080p BluRay',
        audioTag: 'Dolby 5.1',
        genres: ['Comedy', 'Drama'],
        plot: 'Five high school students meet in Saturday detention and discover how they have a lot more in common than they thought.',
        backdropUrl: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=300&auto=format&fit=crop&q=80',
        runtime: '1h 37m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/The%20Breakfast%20Club%20(1985)%20%5b1080p%5d/The.Breakfast.Club.1985.1080p.BluRay.x264.YIFY.mp4',
      },
      {
        id: 'feat-boyhood',
        cleanTitle: 'Boyhood',
        year: 2014,
        imdbRating: '7.9',
        quality: '1080p BluRay',
        audioTag: 'Dolby 5.1',
        genres: ['Drama'],
        plot: 'The life of Mason, from early childhood to his arrival at college, filmed over 12 years with the same cast.',
        backdropUrl: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=300&auto=format&fit=crop&q=80',
        runtime: '2h 45m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/Boyhood%20(2014)%20%5b1080p%5d/Boyhood.2014.1080p.BluRay.x264.YIFY.mp4',
      },
      {
        id: 'feat-wallflower',
        cleanTitle: 'The Perks of Being a Wallflower',
        year: 2012,
        imdbRating: '7.9',
        quality: '1080p BluRay',
        audioTag: 'Dolby 5.1',
        genres: ['Drama', 'Romance'],
        plot: 'An introvert freshman is taken under the wings of two seniors who welcome him to the real world.',
        backdropUrl: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=300&auto=format&fit=crop&q=80',
        runtime: '1h 43m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/The%20Perks%20of%20Being%20a%20Wallflower%20(2012)%20%5b1080p%5d/The.Perks.of.Being.a.Wallflower.2012.1080p.BRrip.x264.GAZ.YIFY.mp4',
      },
    ],
  },
  {
    name: 'Animated Wonders & Family Favorites',
    tag: 'Animation Classics',
    movies: [
      {
        id: 'feat-fantastic-mr-fox',
        cleanTitle: 'Fantastic Mr. Fox',
        year: 2009,
        imdbRating: '7.9',
        quality: '1080p BluRay',
        audioTag: 'Dolby 5.1',
        genres: ['Animation', 'Adventure', 'Comedy'],
        plot: "An urbane fox cannot resist returning to his farm raiding ways and then must help his community survive the farmers' retaliation.",
        backdropUrl: 'https://images.unsplash.com/photo-1474511320723-9a56873867b5?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1474511320723-9a56873867b5?w=300&auto=format&fit=crop&q=80',
        runtime: '1h 27m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/Fantastic%20Mr%20Fox%20(2009)%20%5b1080p%5d/Fantastic.Mr.Fox.2009.1080p.BrRip.x264.YIFY.mp4',
      },
      {
        id: 'feat-surfs-up',
        cleanTitle: "Surf's Up",
        year: 2007,
        imdbRating: '6.7',
        quality: '1080p BluRay',
        audioTag: 'Dolby 5.1',
        genres: ['Animation', 'Comedy', 'Family', 'Sports'],
        plot: 'A behind-the-scenes look at the annual Penguin World Surfing Championship and its newest participant, up-and-comer Cody Maverick.',
        backdropUrl: 'https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=300&auto=format&fit=crop&q=80',
        runtime: '1h 25m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/Surfs%20Up%20(2007)%20%5b1080p%5d%20%5bBluRay%5d%20%5b5.1%5d%20%5bYTS.MX%5d/Surfs.Up.2007.1080p.BluRay.x264.AAC5.1-%5bYTS.MX%5d.mp4',
      },
      {
        id: 'feat-before-sunrise',
        cleanTitle: 'Before Sunrise',
        year: 1995,
        imdbRating: '8.1',
        quality: '1080p BluRay',
        audioTag: 'Dolby 5.1',
        genres: ['Drama', 'Romance'],
        plot: 'A young man and woman meet on a train in Europe, and wind up spending one evening together in Vienna.',
        backdropUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300&auto=format&fit=crop&q=80',
        runtime: '1h 41m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/Before%20Sunrise%20(1995)%20%5bBluRay%5d%20%5b1080p%5d%20%5bYTS.AM%5d/Before.Sunrise.1995.1080p.BluRay.x264-%5bYTS.AM%5d.mp4',
      },
      {
        id: 'feat-wallis-island',
        cleanTitle: 'The Ballad Of Wallis Island',
        year: 2025,
        imdbRating: '7.8',
        quality: '1080p BluRay',
        audioTag: 'Dolby 5.1',
        genres: ['Drama', 'Adventure', 'Mystery'],
        plot: 'A secluded island community faces sudden transformation when long-buried secrets surface during an unexpected ocean expedition.',
        backdropUrl: 'https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=300&auto=format&fit=crop&q=80',
        runtime: '1h 55m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/The%20Ballad%20Of%20Wallis%20Island%20(2025)%20%5b1080p%5d%20%5bBluRay%5d%20%5b5.1%5d%20%5bYTS.MX%5d/The.Ballad.Of.Wallis.Island.2025.1080p.BluRay.x264.AAC5.1-%5bYTS.MX%5d.mp4',
      },
      {
        id: 'feat-magic-faraway-tree',
        cleanTitle: 'The Magic Faraway Tree',
        year: 2026,
        imdbRating: '8.2',
        quality: '1080p WEB-DL',
        audioTag: 'Dolby 5.1',
        genres: ['Animation', 'Adventure', 'Family', 'Fantasy'],
        plot: 'A modern family relocates to the remote English countryside, where their children discover a magical tree inhabited by extraordinary creatures.',
        backdropUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&auto=format&fit=crop&q=80',
        runtime: '1h 48m',
        streamUrl: 'https://www.fradgify.kozow.com/media/movies/The%20Magic%20Faraway%20Tree%20(2026)%20%5b1080p%5d%20%5bWEBRip%5d%20%5bYTS.BZ%5d/The.Magic.Faraway.Tree.2026.1080p.WEBRip.x264.AAC-%5bYTS.BZ%5d.mp4',
      },
    ],
  },
];

// Helper to calculate the active 2-day rotation index (0 to 5)
export function getTwoDayCycleIndex(offset = 0): number {
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
  const cycle = Math.floor(Date.now() / TWO_DAYS_MS) + offset;
  return Math.abs(cycle) % FEATURED_SPOTLIGHT_SETS.length;
}

export const NetflixHome: React.FC<CinemaHomeProps> = ({
  items,
  isLoading,
  onSelectMedia,
  onPlayDirect,
  onOpenFolder,
  watchlistSet,
  onToggleWatchlist,
  onNavigateSection,
}) => {
  // 1-2 Days rotation state: offset allows manual cycling while maintaining automatic 48h rotation
  const [cycleOffset, setCycleOffset] = useState(0);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [quickInfoItem, setQuickInfoItem] = useState<{ item: ParsedFtpItem; meta?: EnrichedMetadata | null } | null>(null);
  const [seriesModalItem, setSeriesModalItem] = useState<ParsedFtpItem | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const currentCycleIndex = useMemo(() => getTwoDayCycleIndex(cycleOffset), [cycleOffset]);
  const currentSet = FEATURED_SPOTLIGHT_SETS[currentCycleIndex] || FEATURED_SPOTLIGHT_SETS[0];
  const activeFeaturedMovies = currentSet.movies;

  // Calculate approximate hours remaining until the next automatic 2-day rotation
  const rotationHoursRemaining = useMemo(() => {
    const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
    const msIntoCycle = Date.now() % TWO_DAYS_MS;
    return Math.max(1, Math.round((TWO_DAYS_MS - msIntoCycle) / (60 * 60 * 1000)));
  }, [currentCycleIndex]);

  const handleNextSpotlightCycle = () => {
    setCycleOffset((prev) => prev + 1);
    setFeaturedIndex(0);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        setFeaturedIndex((prev) => (prev + 1) % activeFeaturedMovies.length);
      } else {
        setFeaturedIndex((prev) => (prev - 1 + activeFeaturedMovies.length) % activeFeaturedMovies.length);
      }
    }
    setTouchStartX(null);
  };

  // Auto-rotate hero spotlight every 10 seconds within the active 2-day collection
  useEffect(() => {
    const timer = setInterval(() => {
      setFeaturedIndex((prev) => (prev + 1) % activeFeaturedMovies.length);
    }, 10000);
    return () => clearInterval(timer);
  }, [activeFeaturedMovies.length]);

  const currentHero = activeFeaturedMovies[featuredIndex] || activeFeaturedMovies[0];

  // Convert currentHero to a playable ParsedFtpItem with real video stream
  const heroFtpItem: ParsedFtpItem = useMemo(() => {
    // If library has a movie matching this title, link to its real FTP item
    const matched = items.find(
      (i) =>
        !i.isDirectory &&
        (i.cleanTitle.toLowerCase().includes(currentHero.cleanTitle.toLowerCase()) ||
          currentHero.cleanTitle.toLowerCase().includes(i.cleanTitle.toLowerCase()))
    );

    if (matched) {
      return {
        ...matched,
        plot: matched.plot || currentHero.plot,
        imdbRating: matched.imdbRating || currentHero.imdbRating,
        year: matched.year || currentHero.year,
        quality: matched.quality || currentHero.quality,
        audioTag: matched.audioTag || currentHero.audioTag,
        backdropUrl: currentHero.backdropUrl,
      };
    }

    return {
      id: currentHero.id,
      cleanTitle: currentHero.cleanTitle,
      rawName: `${currentHero.cleanTitle}.${currentHero.year}.${currentHero.quality}`,
      url: currentHero.streamUrl,
      isDirectory: false,
      mediaKind: 'movie',
      year: currentHero.year,
      imdbRating: currentHero.imdbRating,
      quality: currentHero.quality,
      audioTag: currentHero.audioTag,
      plot: currentHero.plot,
      posterUrl: currentHero.backdropUrl,
      backdropUrl: currentHero.backdropUrl,
      sizeFormatted: '4.2 GB',
      lastModified: '2026-06-01',
    };
  }, [currentHero, items]);

  const isHeroSaved = watchlistSet.has(heroFtpItem.id);

  // -------------------------------------------------------------------
  // CATEGORIZATION: Group items cleanly by each movie & series category
  // -------------------------------------------------------------------

  // 1. New Releases (2024, 2025, 2026)
  const newReleases = useMemo(() => {
    const list = items.filter(
      (i) => i.year && i.year >= 2024 && !i.cleanTitle.toLowerCase().startsWith('season ')
    );
    return sortNewestFirst(list).slice(0, 36);
  }, [items]);

  // 2. Hollywood (English Movies) - Strictly English Movies Only
  const hollywoodMovies = useMemo(() => {
    const list = items.filter((i) => {
      if (i.mediaKind === 'series' || i.mediaKind === 'episode' || i.season !== undefined) {
        return false;
      }
      const url = (i.url || '').toLowerCase();
      const src = (i.sourceServerName || '').toLowerCase();
      const raw = (i.rawName || '').toLowerCase();

      // Strictly exclude series, Korean, Hindi, Bangla, Animation
      if (
        url.includes('tv-series') ||
        url.includes('tv series') ||
        url.includes('korean') ||
        url.includes('bangla') ||
        url.includes('kolkata') ||
        url.includes('hindi') ||
        url.includes('south indian') ||
        url.includes('animation')
      ) {
        return false;
      }
      if (
        src.includes('series') ||
        src.includes('tv') ||
        src.includes('korean') ||
        src.includes('bangla') ||
        src.includes('hindi') ||
        src.includes('south') ||
        src.includes('animation')
      ) {
        return false;
      }
      if (raw.includes('korean') || raw.includes('bollywood') || raw.includes('south')) {
        return false;
      }

      return (
        url.includes('english%20movies') ||
        url.includes('english movies') ||
        src.includes('english movies') ||
        i.mediaKind === 'movie'
      );
    });

    // Merge with pristine Hollywood seed blockbusters so this row is always rich and authentic
    const merged = [...list];
    for (const h of SEED_HOLLYWOOD_CATALOG) {
      if (!merged.some((m) => m.cleanTitle.toLowerCase() === h.cleanTitle.toLowerCase())) {
        merged.push(h);
      }
    }
    return sortNewestFirst(merged).slice(0, 36);
  }, [items]);

  // 3. Hit Comedies & Classic Cinema
  const comedyClassics = useMemo(() => {
    const list = items.filter((i) => {
      if (i.mediaKind === 'series' || i.mediaKind === 'episode') return false;
      const g = (i.genres || []).map((x) => x.toLowerCase());
      const t = i.cleanTitle.toLowerCase();
      return (
        g.includes('comedy') ||
        g.includes('romance') ||
        t.includes('jump street') ||
        t.includes('breakfast club') ||
        t.includes('truman') ||
        t.includes('wallflower') ||
        t.includes('boyhood') ||
        t.includes('before sunrise') ||
        t.includes('coda')
      );
    });
    return sortNewestFirst(list).slice(0, 36);
  }, [items]);

  // 4. Bollywood (Hindi Movies) - From connected active BDIX/Hindi sources + verified seed
  const bollywoodMovies = useMemo(() => {
    const list = items.filter((i) => {
      if (i.mediaKind === 'series' || i.mediaKind === 'episode') return false;
      const url = (i.url || '').toLowerCase();
      const src = (i.sourceServerName || '').toLowerCase();
      const raw = (i.rawName || '').toLowerCase();
      return (
        (url.includes('hindi movies') || src.includes('hindi movies') || raw.includes('bollywood')) &&
        !url.includes('south indian') &&
        !url.includes('hindi dubbed')
      );
    });

    const merged = [...list];
    for (const b of SEED_BOLLYWOOD_CATALOG) {
      if (!merged.some((m) => m.cleanTitle.toLowerCase() === b.cleanTitle.toLowerCase())) {
        merged.push(b);
      }
    }
    return sortNewestFirst(merged).slice(0, 36);
  }, [items]);

  // 5. South Indian (Hindi Dubbed) - From connected active BDIX sources + verified seed
  const southMovies = useMemo(() => {
    const list = items.filter((i) => {
      if (i.mediaKind === 'series' || i.mediaKind === 'episode') return false;
      const url = (i.url || '').toLowerCase();
      const src = (i.sourceServerName || '').toLowerCase();
      const raw = (i.rawName || '').toLowerCase();
      return (
        url.includes('south indian') ||
        url.includes('hindi dubbed') ||
        src.includes('south') ||
        src.includes('dubbed') ||
        raw.includes('south') ||
        raw.includes('tamil') ||
        raw.includes('telugu')
      );
    });

    const merged = [...list];
    for (const s of SEED_SOUTH_CATALOG) {
      if (!merged.some((m) => m.cleanTitle.toLowerCase() === s.cleanTitle.toLowerCase())) {
        merged.push(s);
      }
    }
    return sortNewestFirst(merged).slice(0, 36);
  }, [items]);

  // 6. Korean TV & Web Series
  const koreanSeries = useMemo(() => {
    const list = items.filter((i) => {
      const url = (i.url || '').toLowerCase();
      const src = (i.sourceServerName || '').toLowerCase();
      const raw = (i.rawName || '').toLowerCase();
      return (
        (url.includes('korean') || src.includes('korean') || raw.includes('korean')) &&
        !raw.startsWith('season ')
      );
    });

    const merged = [...list];
    for (const s of SEED_SERIES_CATALOG) {
      if (!merged.some((m) => m.cleanTitle.toLowerCase() === s.cleanTitle.toLowerCase())) {
        merged.push(s);
      }
    }
    return sortNewestFirst(merged).slice(0, 36);
  }, [items]);

  // 7. Kolkata & Bangla Cinema - From connected active BDIX/Bangla sources + verified seed
  const banglaMovies = useMemo(() => {
    const list = items.filter((i) => {
      if (i.mediaKind === 'series' || i.mediaKind === 'episode') return false;
      const url = (i.url || '').toLowerCase();
      const src = (i.sourceServerName || '').toLowerCase();
      const raw = (i.rawName || '').toLowerCase();
      return (
        url.includes('bangla') ||
        url.includes('kolkata') ||
        src.includes('bangla') ||
        src.includes('kolkata') ||
        raw.includes('bangla')
      );
    });

    const merged = [...list];
    for (const b of SEED_BANGLA_CATALOG) {
      if (!merged.some((m) => m.cleanTitle.toLowerCase() === b.cleanTitle.toLowerCase())) {
        merged.push(b);
      }
    }
    return sortNewestFirst(merged).slice(0, 36);
  }, [items]);

  // 8. Animation & Anime Movies
  const animationMovies = useMemo(() => {
    const list = items.filter((i) => {
      if (i.mediaKind === 'series' || i.mediaKind === 'episode') return false;
      const url = (i.url || '').toLowerCase();
      const src = (i.sourceServerName || '').toLowerCase();
      const raw = (i.rawName || '').toLowerCase();
      return (
        url.includes('animation') ||
        url.includes('anime') ||
        src.includes('animation') ||
        raw.includes('animation') ||
        raw.includes('animated')
      );
    });

    const merged = [...list];
    for (const a of SEED_ANIMATION_CATALOG) {
      if (!merged.some((m) => m.cleanTitle.toLowerCase() === a.cleanTitle.toLowerCase())) {
        merged.push(a);
      }
    }
    return sortNewestFirst(merged).slice(0, 36);
  }, [items]);

  // 9. Foreign Language Movies
  const foreignMovies = useMemo(() => {
    const list = items.filter((i) => {
      if (i.mediaKind === 'series' || i.mediaKind === 'episode') return false;
      const url = (i.url || '').toLowerCase();
      const src = (i.sourceServerName || '').toLowerCase();
      return url.includes('foreign') || src.includes('foreign');
    });
    return sortNewestFirst(list).slice(0, 36);
  }, [items]);

  // 10. All TV Shows & Complete Series (No Season 1 duplicates)
  const allSeries = useMemo(() => {
    const list = items.filter(
      (i) =>
        (i.mediaKind === 'series' || i.season !== undefined) &&
        !i.cleanTitle.toLowerCase().startsWith('season ')
    );

    const merged = [...list];
    for (const s of SEED_SERIES_CATALOG) {
      if (!merged.some((m) => m.cleanTitle.toLowerCase() === s.cleanTitle.toLowerCase())) {
        merged.push(s);
      }
    }
    return sortNewestFirst(merged).slice(0, 36);
  }, [items]);

  // 11. Action & High-Octane Thrillers
  const actionMovies = useMemo(() => {
    const list = items.filter((i) => {
      const str = `${i.cleanTitle} ${i.rawName} ${(i.genres || []).join(' ')}`.toLowerCase();
      return /\b(action|war|fight|mission|combat|agent|police|gangster|gun|furious|thriller)\b/i.test(str);
    });
    return sortNewestFirst(list).slice(0, 36);
  }, [items]);

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden bg-[#090A0F] pb-24 text-zinc-100 select-none">
      {/* 1. CINEMATIC HERO SECTION: NEW MOVIE SPOTLIGHT */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative w-full h-[58vh] min-h-[440px] sm:min-h-[480px] max-h-[720px] bg-[#090A0F] overflow-hidden group touch-pan-y"
      >
        {/* Backdrop Image with Cinema Vignette Overlay */}
        <div className="absolute inset-0 z-0">
          <img
            src={currentHero.backdropUrl}
            alt={currentHero.cleanTitle}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center transform scale-100 transition-all duration-1000 ease-out filter brightness-80"
          />
          {/* Deep dark gradient overlays for sharp typography readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#090A0F] via-[#090A0F]/75 to-transparent w-full md:w-3/4" />
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#090A0F] via-[#090A0F]/90 to-transparent" />
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#090A0F]/80 to-transparent" />
        </div>

        {/* Hero Information */}
        <div className="relative z-10 flex flex-col justify-end h-full px-4 sm:px-10 lg:px-14 pb-12 sm:pb-14 max-w-4xl space-y-3">
          {/* 2-Day Automatic Rotation Badge */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 font-bold text-[10px] sm:text-[11px] tracking-wider uppercase text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 rounded-full shadow-sm">
              <Flame className="w-3 h-3 text-amber-400 fill-amber-400" />
              <span>2-DAY SPOTLIGHT • SET {currentCycleIndex + 1}/6</span>
            </span>
            <span className="text-[11px] font-semibold text-amber-400/90 hidden sm:inline bg-black/40 px-2.5 py-0.5 rounded border border-amber-500/20">
              {currentSet.name}
            </span>
            <span className="text-[11px] font-mono text-zinc-400 hidden md:inline">
              • Auto-rotates every 48h (~{rotationHoursRemaining}h left)
            </span>
          </div>

          {/* Title */}
          <h1 className="text-2xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight drop-shadow-2xl line-clamp-2 leading-tight">
            {currentHero.cleanTitle}
          </h1>

          {/* Metadata Badges: IMDb, Year, Duration, 4K, Audio */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 text-xs sm:text-sm font-medium text-zinc-300">
            <div className="flex items-center gap-1 text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded text-xs">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>{currentHero.imdbRating}</span>
            </div>
            <span className="text-zinc-300 font-semibold">{currentHero.year}</span>
            <span className="text-zinc-400 font-mono text-xs">{currentHero.runtime}</span>
            <span className="px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold border border-zinc-600 text-zinc-200 rounded tracking-wider bg-black/40">
              {currentHero.quality}
            </span>
            <span className="px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold bg-white/10 text-zinc-300 rounded">
              {currentHero.audioTag}
            </span>
          </div>

          {/* Plot Synopsis */}
          <p className="text-xs sm:text-sm lg:text-base text-zinc-300 line-clamp-2 sm:line-clamp-3 max-w-xl drop-shadow font-normal leading-relaxed">
            {currentHero.plot}
          </p>

          {/* Action Buttons: Play + Details + Watchlist + Manual Shuffle */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-2 w-full sm:w-auto">
            <button
              onClick={() => onPlayDirect(heroFtpItem)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 sm:px-8 py-3 bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-bold text-xs sm:text-base rounded-xl shadow-xl shadow-amber-500/20 transition-all cursor-pointer min-h-[44px]"
            >
              <Play className="w-4 sm:w-5 h-4 sm:h-5 fill-black text-black" />
              <span>Watch Now</span>
            </button>

            <button
              onClick={() => setQuickInfoItem({ item: heroFtpItem })}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 sm:px-6 py-3 bg-zinc-800/80 hover:bg-zinc-700 active:scale-95 text-white font-semibold text-xs sm:text-base rounded-xl backdrop-blur-md transition-all cursor-pointer border border-white/15 min-h-[44px]"
            >
              <Info className="w-4 sm:w-5 h-4 sm:h-5 text-zinc-300" />
              <span>Details</span>
            </button>

            <button
              onClick={() => onToggleWatchlist(heroFtpItem)}
              className={`p-3 rounded-xl border transition-all cursor-pointer shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center ${
                isHeroSaved
                  ? 'bg-amber-500/20 border-amber-400 text-amber-400'
                  : 'bg-black/50 border-white/20 text-white hover:border-white hover:bg-black/70'
              }`}
              title={isHeroSaved ? 'In Watchlist' : 'Add to Watchlist'}
            >
              {isHeroSaved ? <Check className="w-4 sm:w-5 h-4 sm:h-5" /> : <Plus className="w-4 sm:w-5 h-4 sm:h-5" />}
            </button>

            <button
              onClick={handleNextSpotlightCycle}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 active:scale-95 text-amber-300 text-xs font-semibold rounded-xl border border-amber-400/30 flex items-center gap-1.5 transition-all cursor-pointer min-h-[44px]"
              title="Shuffle to next 2-day spotlight set"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Shuffle Spotlight (Next Set)</span>
              <span className="sm:hidden">Next Set</span>
            </button>
          </div>

          {/* Mobile Dot Indicators */}
          <div className="flex md:hidden items-center justify-center gap-1.5 pt-2">
            {activeFeaturedMovies.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setFeaturedIndex(idx)}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  idx === featuredIndex ? 'w-5 bg-amber-400' : 'w-1.5 bg-white/30'
                }`}
                aria-label={`Go to featured movie ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Right Side: Interactive New Movie Suggestions Switcher */}
        <div className="absolute right-4 sm:right-10 bottom-14 z-20 hidden md:flex flex-col items-end gap-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono tracking-wider uppercase text-zinc-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>2-Day Spotlight ({currentCycleIndex + 1}/6)</span>
            </span>
            <button
              onClick={handleNextSpotlightCycle}
              className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/25 px-2 py-0.5 rounded border border-amber-500/30 transition-colors cursor-pointer"
              title="Advance to next 2-day featured set"
            >
              Change Set
            </button>
          </div>

          {/* Mini Thumbnail Row */}
          <div className="flex items-center gap-2 p-1.5 bg-black/60 backdrop-blur-md rounded-xl border border-white/15 shadow-2xl">
            {activeFeaturedMovies.map((m, idx) => (
              <button
                key={m.id}
                onClick={() => setFeaturedIndex(idx)}
                className={`relative w-14 sm:w-16 h-10 sm:h-11 rounded-lg overflow-hidden border-2 transition-all cursor-pointer group/thumb ${
                  idx === featuredIndex
                    ? 'border-amber-400 scale-105 shadow-md shadow-amber-500/30 ring-1 ring-amber-400'
                    : 'border-white/10 opacity-60 hover:opacity-100 hover:border-white/40'
                }`}
                title={m.cleanTitle}
              >
                <img
                  src={m.thumbUrl}
                  alt={m.cleanTitle}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                {idx === featuredIndex && (
                  <div className="absolute bottom-0 inset-x-0 h-1 bg-amber-400" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. CATEGORIZED HORIZONTAL MOVIE ROWS */}
      <div className="relative z-20 -mt-6 sm:-mt-8 space-y-9 sm:space-y-11">
        {/* ROW 1: LATEST RELEASES & BLOCKBUSTERS (2024-2026) */}
        {newReleases.length > 0 && (
          <CinemaCategoryRow
            title="Latest Releases & Blockbusters"
            icon={<Flame className="w-5 h-5 text-amber-400 fill-amber-400/20" />}
            countBadge={`${newReleases.length} New Titles`}
            items={newReleases}
            watchlistSet={watchlistSet}
            onSelectMedia={onSelectMedia}
            onPlayDirect={onPlayDirect}
            onToggleWatchlist={onToggleWatchlist}
            onOpenFolder={onOpenFolder}
          />
        )}

        {/* ROW 2: ALL-TIME BLOCKBUSTERS & OSCAR WINNERS */}
        {hollywoodMovies.length > 0 && (
          <CinemaCategoryRow
            title="All-Time Blockbusters & Oscar Winners"
            icon={<Clapperboard className="w-5 h-5 text-blue-400" />}
            countBadge="Blockbuster Cinema"
            items={hollywoodMovies}
            watchlistSet={watchlistSet}
            onSelectMedia={onSelectMedia}
            onPlayDirect={onPlayDirect}
            onToggleWatchlist={onToggleWatchlist}
            onOpenFolder={onOpenFolder}
            onExploreAll={() => onNavigateSection && onNavigateSection('movies')}
          />
        )}

        {/* ROW 3: ACTION, SCI-FI & SURVIVAL THRILLERS */}
        {actionMovies.length > 0 && (
          <CinemaCategoryRow
            title="Action, Sci-Fi & Survival Thrillers"
            icon={<Flame className="w-5 h-5 text-orange-400" />}
            countBadge="Action & Sci-Fi"
            items={actionMovies}
            watchlistSet={watchlistSet}
            onSelectMedia={onSelectMedia}
            onPlayDirect={onPlayDirect}
            onToggleWatchlist={onToggleWatchlist}
            onOpenFolder={onOpenFolder}
            onExploreAll={() => onNavigateSection && onNavigateSection('movies')}
          />
        )}

        {/* ROW 4: HIT COMEDIES & CLASSIC CINEMA */}
        {comedyClassics.length > 0 && (
          <CinemaCategoryRow
            title="Hit Comedies & Classic Cinema"
            icon={<Smile className="w-5 h-5 text-amber-400" />}
            countBadge="Comedy & Classics"
            items={comedyClassics}
            watchlistSet={watchlistSet}
            onSelectMedia={onSelectMedia}
            onPlayDirect={onPlayDirect}
            onToggleWatchlist={onToggleWatchlist}
            onOpenFolder={onOpenFolder}
          />
        )}

        {/* ROW 5: ANIMATION & FAMILY ADVENTURES */}
        {animationMovies.length > 0 && (
          <CinemaCategoryRow
            title="Animation & Family Adventures"
            icon={<Smile className="w-5 h-5 text-purple-400" />}
            countBadge="Animated Features"
            items={animationMovies}
            watchlistSet={watchlistSet}
            onSelectMedia={onSelectMedia}
            onPlayDirect={onPlayDirect}
            onToggleWatchlist={onToggleWatchlist}
            onOpenFolder={onOpenFolder}
          />
        )}

        {/* ROW 6: TV SHOWS & COMPLETE WEB SERIES */}
        {allSeries.length > 0 && (
          <CinemaCategoryRow
            title="TV Shows & Complete Web Series"
            icon={<Tv className="w-5 h-5 text-cyan-400" />}
            countBadge="Full Seasons"
            items={allSeries}
            watchlistSet={watchlistSet}
            onSelectMedia={onSelectMedia}
            onPlayDirect={onPlayDirect}
            onToggleWatchlist={onToggleWatchlist}
            onOpenFolder={onOpenFolder}
            onExploreAll={() => onNavigateSection && onNavigateSection('series')}
          />
        )}

        {/* ROW 7: KOLKATA & BANGLA CINEMA (Appears when active Bangla servers are connected) */}
        {banglaMovies.length > 0 && (
          <CinemaCategoryRow
            title="Kolkata & Bangla Cinema"
            icon={<Film className="w-5 h-5 text-emerald-400" />}
            countBadge="Bangla Movies"
            items={banglaMovies}
            watchlistSet={watchlistSet}
            onSelectMedia={onSelectMedia}
            onPlayDirect={onPlayDirect}
            onToggleWatchlist={onToggleWatchlist}
            onOpenFolder={onOpenFolder}
          />
        )}

        {/* ROW 8: BOLLYWOOD (HINDI MOVIES) (Appears when active Hindi servers are connected) */}
        {bollywoodMovies.length > 0 && (
          <CinemaCategoryRow
            title="Bollywood (Hindi Movies)"
            icon={<Film className="w-5 h-5 text-rose-400" />}
            countBadge="Hindi Hits"
            items={bollywoodMovies}
            watchlistSet={watchlistSet}
            onSelectMedia={onSelectMedia}
            onPlayDirect={onPlayDirect}
            onToggleWatchlist={onToggleWatchlist}
            onOpenFolder={onOpenFolder}
          />
        )}

        {/* ROW 9: SOUTH INDIAN CINEMA (HINDI DUBBED) (Appears when active South servers are connected) */}
        {southMovies.length > 0 && (
          <CinemaCategoryRow
            title="South Indian Cinema (Hindi Dubbed)"
            icon={<Zap className="w-5 h-5 text-amber-400 fill-amber-400/20" />}
            countBadge="Dual Audio & Dubbed"
            items={southMovies}
            watchlistSet={watchlistSet}
            onSelectMedia={onSelectMedia}
            onPlayDirect={onPlayDirect}
            onToggleWatchlist={onToggleWatchlist}
            onOpenFolder={onOpenFolder}
          />
        )}

        {/* ROW 10: FOREIGN LANGUAGE CINEMA */}
        {foreignMovies.length > 0 && (
          <CinemaCategoryRow
            title="Foreign Language Cinema"
            icon={<Globe className="w-5 h-5 text-indigo-400" />}
            countBadge="World Cinema"
            items={foreignMovies}
            watchlistSet={watchlistSet}
            onSelectMedia={onSelectMedia}
            onPlayDirect={onPlayDirect}
            onToggleWatchlist={onToggleWatchlist}
            onOpenFolder={onOpenFolder}
          />
        )}
      </div>

      {/* 3. DETAILS & INFO MODAL */}
      {quickInfoItem && (
        <CinemaDetailModal
          item={quickInfoItem.item}
          meta={quickInfoItem.meta}
          isSaved={watchlistSet.has(quickInfoItem.item.id)}
          onClose={() => setQuickInfoItem(null)}
          onPlayDirect={onPlayDirect}
          onToggleWatchlist={onToggleWatchlist}
          onBrowseSeries={(item) => {
            setQuickInfoItem(null);
            setSeriesModalItem(item);
          }}
        />
      )}

      {/* 4. SERIES SEASON & EPISODE BROWSER MODAL */}
      {seriesModalItem && (
        <SeriesSeasonModal
          seriesItem={seriesModalItem}
          onClose={() => setSeriesModalItem(null)}
          onPlayEpisode={(ep) => {
            onPlayDirect(ep);
          }}
          onOpenRawFolder={(url) => {
            if (onOpenFolder) onOpenFolder(url, seriesModalItem.cleanTitle);
          }}
        />
      )}
    </div>
  );
};

// -------------------------------------------------------------
// REUSABLE CATEGORY CAROUSEL ROW COMPONENT
// -------------------------------------------------------------
interface CinemaCategoryRowProps {
  title: string;
  icon: React.ReactNode;
  countBadge?: string;
  items: ParsedFtpItem[];
  watchlistSet: Set<string>;
  onSelectMedia: (item: ParsedFtpItem) => void;
  onPlayDirect: (item: ParsedFtpItem) => void;
  onToggleWatchlist: (item: ParsedFtpItem) => void;
  onOpenFolder?: (url: string, title: string) => void;
  onExploreAll?: () => void;
}

const CinemaCategoryRow: React.FC<CinemaCategoryRowProps> = ({
  title,
  icon,
  countBadge,
  items,
  watchlistSet,
  onSelectMedia,
  onPlayDirect,
  onToggleWatchlist,
  onOpenFolder,
  onExploreAll,
}) => {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (!rowRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
    setCanScrollLeft(scrollLeft > 20);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 20);
  };

  const handleScroll = (direction: 'left' | 'right') => {
    if (!rowRef.current) return;
    const offset = rowRef.current.clientWidth * 0.75;
    rowRef.current.scrollBy({
      left: direction === 'left' ? -offset : offset,
      behavior: 'smooth',
    });
  };

  return (
    <div className="relative group/row px-4 sm:px-10 lg:px-14">
      {/* Category Row Header */}
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-white/5 border border-white/10">
            {icon}
          </div>
          <div>
            <h2 className="text-base sm:text-xl font-display font-bold text-white tracking-tight">
              {title}
            </h2>
          </div>
          {countBadge && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-zinc-400 border border-white/10 hidden sm:inline">
              {countBadge}
            </span>
          )}
        </div>

        {onExploreAll && (
          <button
            onClick={onExploreAll}
            className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold transition-colors cursor-pointer"
          >
            <span>View All</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Left Chevron Button (Desktop only, mobile uses native touch swipe) */}
      {canScrollLeft && (
        <button
          onClick={() => handleScroll('left')}
          className="hidden md:flex absolute left-0 sm:left-4 top-1/2 -translate-y-1/2 z-30 h-4/5 w-10 sm:w-12 bg-black/80 hover:bg-black/95 text-white items-center justify-center rounded-r-xl transition-all opacity-0 group-hover/row:opacity-100 cursor-pointer shadow-2xl border-r border-white/10"
          title="Scroll Left"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* Right Chevron Button (Desktop only) */}
      {canScrollRight && (
        <button
          onClick={() => handleScroll('right')}
          className="hidden md:flex absolute right-0 sm:right-4 top-1/2 -translate-y-1/2 z-30 h-4/5 w-10 sm:w-12 bg-black/80 hover:bg-black/95 text-white items-center justify-center rounded-l-xl transition-all opacity-0 group-hover/row:opacity-100 cursor-pointer shadow-2xl border-l border-white/10"
          title="Scroll Right"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Horizontal Carousel */}
      <div
        ref={rowRef}
        onScroll={checkScroll}
        className="flex gap-2.5 sm:gap-4 overflow-x-auto scrollbar-none scroll-smooth py-2 px-0.5"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {items.map((item) => (
          <div key={item.id} className="flex-shrink-0 w-[130px] sm:w-44 md:w-48 active:scale-95 transition-transform duration-150">
            <MediaPosterCard
              item={item}
              isSaved={watchlistSet.has(item.id)}
              onSelect={onSelectMedia}
              onPlayDirect={onPlayDirect}
              onOpenFolder={onOpenFolder}
              onToggleWatchlist={onToggleWatchlist}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// DETAILS & INFO MODAL
// -------------------------------------------------------------
interface CinemaDetailModalProps {
  item: ParsedFtpItem;
  meta?: EnrichedMetadata | null;
  isSaved: boolean;
  onClose: () => void;
  onPlayDirect: (item: ParsedFtpItem) => void;
  onToggleWatchlist: (item: ParsedFtpItem) => void;
  onBrowseSeries: (item: ParsedFtpItem) => void;
}

const CinemaDetailModal: React.FC<CinemaDetailModalProps> = ({
  item,
  meta,
  isSaved,
  onClose,
  onPlayDirect,
  onToggleWatchlist,
  onBrowseSeries,
}) => {
  const isSeries =
    item.mediaKind === 'series' ||
    item.mediaKind === 'episode' ||
    item.cleanTitle.toLowerCase().includes('season');

  const bgImage = meta?.backdropUrl || meta?.posterUrl || item.posterUrl || 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1600&auto=format&fit=crop&q=80';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-[#141722] rounded-2xl overflow-hidden shadow-2xl border border-white/10 text-white my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 w-8 sm:w-9 h-8 sm:h-9 rounded-full bg-black/80 hover:bg-black text-white flex items-center justify-center transition-colors cursor-pointer border border-white/20 shadow-lg"
          title="Close"
        >
          <X className="w-4 sm:w-5 h-4 sm:h-5" />
        </button>

        {/* Modal Backdrop Banner */}
        <div className="relative w-full h-56 sm:h-80 bg-[#0C0E14]">
          <img
            src={bgImage}
            alt={item.cleanTitle}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#141722] via-[#141722]/50 to-transparent" />

          {/* Modal Header Actions */}
          <div className="absolute bottom-4 sm:bottom-6 left-4 sm:left-6 right-4 sm:right-6">
            <h2 className="text-xl sm:text-4xl font-black text-white drop-shadow-xl line-clamp-2">
              {item.cleanTitle}
            </h2>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-3">
              <button
                onClick={() => {
                  onClose();
                  onPlayDirect(item);
                }}
                className="flex items-center gap-2 px-5 sm:px-7 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs sm:text-base rounded-lg shadow-xl shadow-amber-500/20 transition-all cursor-pointer"
              >
                <Play className="w-4 sm:w-5 h-4 sm:h-5 fill-black text-black" />
                <span>Play Now</span>
              </button>

              <button
                onClick={() => onToggleWatchlist(item)}
                className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                  isSaved
                    ? 'bg-amber-500/20 border-amber-400 text-amber-400'
                    : 'bg-[#222738] border-white/20 text-white hover:border-white'
                }`}
                title={isSaved ? 'In Watchlist' : 'Add to Watchlist'}
              >
                {isSaved ? <Check className="w-4 sm:w-5 h-4 sm:h-5 text-amber-400" /> : <Plus className="w-4 sm:w-5 h-4 sm:h-5" />}
              </button>

              {isSeries && (
                <button
                  onClick={() => onBrowseSeries(item)}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 bg-[#252E42] hover:bg-[#2F3A54] text-white font-medium text-xs sm:text-sm rounded-lg transition-all cursor-pointer ml-auto border border-white/10"
                >
                  <Layers className="w-4 h-4 text-cyan-400" />
                  <span>Episodes</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Modal Content Body */}
        <div className="p-4 sm:p-8 grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
          {/* Left Details */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex flex-wrap items-center gap-2.5 text-xs sm:text-sm text-zinc-300">
              {item.imdbRating && (
                <span className="flex items-center gap-1 text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span>{item.imdbRating} IMDb</span>
                </span>
              )}
              {item.year && <span className="font-semibold text-zinc-200">{item.year}</span>}
              <span className="px-1.5 py-0.5 text-[10px] font-bold border border-zinc-600 rounded bg-white/5">
                {item.quality || '1080p HD'}
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-white/10 rounded">
                {item.audioTag || 'Stereo / 5.1'}
              </span>
            </div>

            <p className="text-sm text-zinc-300 leading-relaxed font-normal">
              {meta?.plot ||
                item.plot ||
                `Stream ${item.cleanTitle} directly with zero buffering from local BDIX cache. High bitrate audio & crystal-clear picture.`}
            </p>

            {/* Direct stream URL info */}
            <div className="p-3 bg-[#0C0E14] border border-white/5 rounded-xl text-xs space-y-1">
              <span className="text-zinc-500 font-mono text-[11px] block">Stream URL:</span>
              <p className="text-zinc-300 font-mono break-all line-clamp-1">{item.url}</p>
            </div>
          </div>

          {/* Right Metadata */}
          <div className="space-y-3.5 text-xs text-zinc-400 border-t md:border-t-0 md:border-l md:border-white/10 md:pl-6 pt-4 md:pt-0">
            <div>
              <span className="text-zinc-500 block mb-0.5">Audio Tracks:</span>
              <span className="text-zinc-200">{item.audioTag || 'Dual Audio (Hindi + English)'}</span>
            </div>

            <div>
              <span className="text-zinc-500 block mb-0.5">Genres:</span>
              <span className="text-zinc-200">
                {item.genres?.join(', ') || 'Action, Drama, Thriller'}
              </span>
            </div>

            <div>
              <span className="text-zinc-500 block mb-0.5">Format:</span>
              <span className="text-zinc-200 font-mono">{item.quality || '1080p WEB-DL'}</span>
            </div>

            <div>
              <span className="text-zinc-500 block mb-0.5">BDIX Server:</span>
              <span className="text-amber-400 font-medium">
                {item.sourceServerName || 'Fast Local CDN'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
