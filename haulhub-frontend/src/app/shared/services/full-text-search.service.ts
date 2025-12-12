import { Injectable } from '@angular/core';

export interface SearchableField {
  key: string;
  weight: number; // Higher weight = more important in search results
  type: 'text' | 'number' | 'date' | 'boolean';
}

export interface SearchResult<T> {
  item: T;
  score: number;
  matchedFields: string[];
  highlights: { [key: string]: string };
}

export interface SearchOptions {
  fields?: string[]; // Specific fields to search, if not provided searches all
  fuzzy?: boolean; // Enable fuzzy matching
  caseSensitive?: boolean;
  minScore?: number; // Minimum score threshold
  maxResults?: number;
}

@Injectable({
  providedIn: 'root'
})
export class FullTextSearchService {
  /**
   * Perform full-text search across multiple fields of items
   */
  search<T>(
    items: T[],
    query: string,
    searchableFields: SearchableField[],
    options: SearchOptions = {}
  ): SearchResult<T>[] {
    if (!query || query.trim().length === 0) {
      return items.map(item => ({
        item,
        score: 1,
        matchedFields: [],
        highlights: {}
      }));
    }

    const {
      fields,
      fuzzy = true,
      caseSensitive = false,
      minScore = 0.1,
      maxResults
    } = options;

    const searchTerms = this.tokenize(query, caseSensitive);
    const results: SearchResult<T>[] = [];

    for (const item of items) {
      const result = this.searchItem(
        item,
        searchTerms,
        searchableFields,
        fields,
        fuzzy,
        caseSensitive
      );

      if (result.score >= minScore) {
        results.push(result);
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Limit results if maxResults specified
    return maxResults ? results.slice(0, maxResults) : results;
  }

  /**
   * Search within a single item
   */
  private searchItem<T>(
    item: T,
    searchTerms: string[],
    searchableFields: SearchableField[],
    targetFields: string[] | undefined,
    fuzzy: boolean,
    caseSensitive: boolean
  ): SearchResult<T> {
    let totalScore = 0;
    let totalWeight = 0;
    const matchedFields: string[] = [];
    const highlights: { [key: string]: string } = {};

    for (const field of searchableFields) {
      // Skip if specific fields requested and this isn't one of them
      if (targetFields && !targetFields.includes(field.key)) {
        continue;
      }

      const value = this.getNestedValue(item, field.key);
      if (value === null || value === undefined) {
        continue;
      }

      const stringValue = String(value);
      const normalizedValue = caseSensitive ? stringValue : stringValue.toLowerCase();

      let fieldScore = 0;
      let hasMatch = false;

      for (const term of searchTerms) {
        if (fuzzy) {
          const fuzzyScore = this.fuzzyMatch(normalizedValue, term);
          if (fuzzyScore > 0) {
            fieldScore += fuzzyScore;
            hasMatch = true;
          }
        } else {
          if (normalizedValue.includes(term)) {
            // Exact match gets higher score
            fieldScore += 1;
            hasMatch = true;
          }
        }
      }

      if (hasMatch) {
        matchedFields.push(field.key);
        highlights[field.key] = this.highlightMatches(stringValue, searchTerms, caseSensitive);
        totalScore += fieldScore * field.weight;
        totalWeight += field.weight;
      }
    }

    // Normalize score by total weight
    const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 0;

    return {
      item,
      score: normalizedScore,
      matchedFields,
      highlights
    };
  }

  /**
   * Fuzzy string matching using Levenshtein distance
   */
  private fuzzyMatch(text: string, term: string): number {
    // Check for exact substring match first (highest score)
    if (text.includes(term)) {
      return 1.0;
    }

    // Check for partial matches
    const words = text.split(/\s+/);
    let bestScore = 0;

    for (const word of words) {
      const distance = this.levenshteinDistance(word, term);
      const maxLength = Math.max(word.length, term.length);
      const similarity = 1 - distance / maxLength;

      // Only consider matches with >70% similarity
      if (similarity > 0.7) {
        bestScore = Math.max(bestScore, similarity);
      }
    }

    return bestScore;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Highlight matching terms in text
   */
  private highlightMatches(text: string, terms: string[], caseSensitive: boolean): string {
    let highlighted = text;

    for (const term of terms) {
      const regex = new RegExp(
        `(${this.escapeRegex(term)})`,
        caseSensitive ? 'g' : 'gi'
      );
      highlighted = highlighted.replace(regex, '<mark>$1</mark>');
    }

    return highlighted;
  }

  /**
   * Tokenize search query into terms
   */
  private tokenize(query: string, caseSensitive: boolean): string[] {
    const normalized = caseSensitive ? query : query.toLowerCase();
    return normalized
      .split(/\s+/)
      .filter(term => term.length > 0)
      .map(term => term.trim());
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get searchable fields configuration for trips
   */
  getTripSearchableFields(): SearchableField[] {
    return [
      { key: 'tripId', weight: 1.5, type: 'text' },
      { key: 'orderConfirmation', weight: 1.5, type: 'text' },
      { key: 'pickupLocation', weight: 1.2, type: 'text' },
      { key: 'dropoffLocation', weight: 1.2, type: 'text' },
      { key: 'pickupCompany', weight: 1.0, type: 'text' },
      { key: 'deliveryCompany', weight: 1.0, type: 'text' },
      { key: 'pickupCity', weight: 0.8, type: 'text' },
      { key: 'pickupState', weight: 0.8, type: 'text' },
      { key: 'deliveryCity', weight: 0.8, type: 'text' },
      { key: 'deliveryState', weight: 0.8, type: 'text' },
      { key: 'driverName', weight: 1.0, type: 'text' },
      { key: 'truckName', weight: 0.9, type: 'text' },
      { key: 'trailerName', weight: 0.9, type: 'text' },
      { key: 'brokerName', weight: 1.0, type: 'text' },
      { key: 'notes', weight: 0.7, type: 'text' },
      { key: 'invoiceNumber', weight: 1.3, type: 'text' }
    ];
  }

  /**
   * Get searchable fields configuration for drivers
   */
  getDriverSearchableFields(): SearchableField[] {
    return [
      { key: 'name', weight: 1.5, type: 'text' },
      { key: 'email', weight: 1.2, type: 'text' },
      { key: 'phone', weight: 1.0, type: 'text' },
      { key: 'address', weight: 0.8, type: 'text' },
      { key: 'city', weight: 0.8, type: 'text' },
      { key: 'state', weight: 0.8, type: 'text' },
      { key: 'cdlState', weight: 0.7, type: 'text' },
      { key: 'corpName', weight: 1.0, type: 'text' },
      { key: 'notes', weight: 0.6, type: 'text' }
    ];
  }

  /**
   * Get searchable fields configuration for vehicles (trucks/trailers)
   */
  getVehicleSearchableFields(): SearchableField[] {
    return [
      { key: 'name', weight: 1.5, type: 'text' },
      { key: 'vin', weight: 1.3, type: 'text' },
      { key: 'licensePlate', weight: 1.3, type: 'text' },
      { key: 'brand', weight: 1.0, type: 'text' },
      { key: 'color', weight: 0.8, type: 'text' },
      { key: 'year', weight: 0.7, type: 'number' },
      { key: 'notes', weight: 0.6, type: 'text' }
    ];
  }
}
