export type EliminationBoundary = 'over' | 'at_or_over';
export type GameEndMode = 'last_standing' | 'first_out';
export type HalvingType = 'half' | 'subtract50';
export type YanivLimitMode = 'off' | 'warn' | 'block';

export interface Rules {
  /** Afvalgrens; 0 = geen grens (potje eindigt alleen handmatig). */
  scoreLimit: number;
  eliminationBoundary: EliminationBoundary;
  gameEndMode: GameEndMode;
  /** Maximaal aantal punten in de hand om Yaniv te mogen roepen. */
  yanivCallLimit: number;
  yanivLimitMode: YanivLimitMode;
  halvingEnabled: boolean;
  halvingType: HalvingType;
  /** Bonus als de nieuwe totaalscore een veelvoud is van dit getal. */
  halvingEvery: number;
  /** Strafpunten voor de Yaniv-roeper bij een Assaf. */
  assafPenalty: number;
  /** Krijgt degene die Assaf roept zijn eigen handpunten (true) of 0 (false, officieel). */
  assafWinnerGetsHandPoints: boolean;
  /** Plausibiliteitscontrole voor invoer van handpunten. */
  maxHandPoints: number;
}

export interface RulePreset {
  id: string;
  name: string;
  rules: Rules;
  builtIn?: boolean;
  updatedAt: number;
  deleted?: boolean;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  updatedAt: number;
  archived?: boolean;
  deleted?: boolean;
}

export interface Round {
  id: string;
  /** Wie riep Yaniv. */
  callerId: string;
  /** Wie riep Assaf (had evenveel of minder punten), of null. */
  assafById: string | null;
  /** Handpunten per (levende) speler. */
  hands: Record<string, number>;
  /** Alleen voor gemigreerde rondes uit v1: vaste punten i.p.v. berekend uit handen. */
  fixedScores?: Record<string, number>;
  at: string;
}

export type GameStatus = 'active' | 'finished';

export interface Game {
  /** Tevens de deelcode (6 tekens). */
  id: string;
  createdAt: number;
  updatedAt: number;
  version: number;
  status: GameStatus;
  rules: Rules;
  /** Momentopname van de spelers bij de start van het potje. */
  players: Pick<Player, 'id' | 'name' | 'color'>[];
  rounds: Round[];
  finishedAt?: number;
  endedManually?: boolean;
}

export interface Library {
  players: Player[];
  presets: RulePreset[];
}

export interface GameSummary {
  id: string;
  status: GameStatus;
  updatedAt: number;
  createdAt: number;
  rounds: number;
  players: string[];
  championName: string | null;
}
