import { useRoute } from './lib/router';
import { GameScreen } from './screens/GameScreen';
import { HomeScreen } from './screens/HomeScreen';
import { HistoryScreen, PlayersScreen, PresetsScreen, SettingsScreen } from './screens/LibraryScreens';
import { NewGameScreen } from './screens/NewGameScreen';

export function App() {
  const route = useRoute();
  switch (route.name) {
    case 'new': return <NewGameScreen />;
    case 'game': return <GameScreen key={route.id} id={route.id} editKey={route.key} />;
    case 'players': return <PlayersScreen />;
    case 'presets': return <PresetsScreen />;
    case 'history': return <HistoryScreen />;
    case 'settings': return <SettingsScreen />;
    default: return <HomeScreen />;
  }
}
