import { INSTALL_FOLDER_MAX_LENGTH } from './constants';

/** Case- and whitespace-insensitive key used to match the same game across data sources. */
export const normalizeTitle = (title: string) => title.trim().toLowerCase();

/** Filesystem-safe folder name for a game's install directory. */
export function installFolderName(title: string, fallback: string): string {
  return title.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, INSTALL_FOLDER_MAX_LENGTH) || fallback;
}

export function installDestination(installRoot: string, title: string, fallback: string): string {
  return `${installRoot.replace(/\/+$/, '')}/${installFolderName(title, fallback)}`;
}

/** Heading letter for the alphabetical list view. */
export function libraryLetter(title: string): string {
  const first = title.trim().charAt(0).normalize('NFD').charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
}
