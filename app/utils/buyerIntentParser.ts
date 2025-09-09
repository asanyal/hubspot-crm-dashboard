/**
 * Utility functions for parsing buyer_intent_explanation data structures
 */

export interface ParsedBuyerIntentSection {
  title: string;
  bulletPoints: string[];
}

/**
 * Parses buyer_intent_explanation that can be in multiple formats:
 * 1. String - simple text explanation
 * 2. Object with arrays - { "Section": ["point1", "point2"] }
 * 3. Object with objects containing booleans - { "Section": { "point1": true, "point2": false } }
 * 
 * @param explanation - The buyer intent explanation data
 * @returns Array of parsed sections with titles and bullet points
 */
export const parseBuyerIntentExplanation = (explanation: any): ParsedBuyerIntentSection[] => {
  // Handle null, undefined, or 'N/A' cases
  if (!explanation || explanation === 'N/A') {
    return [];
  }

  // Handle string explanation
  if (typeof explanation === 'string') {
    return [{
      title: 'Explanation',
      bulletPoints: [explanation]
    }];
  }

  // Handle object explanation
  if (typeof explanation === 'object' && !Array.isArray(explanation)) {
    const sections: ParsedBuyerIntentSection[] = [];

    Object.entries(explanation).forEach(([title, rawBulletPoints]) => {
      const bulletPoints: string[] = [];

      if (Array.isArray(rawBulletPoints)) {
        // Format 1: Array of strings
        bulletPoints.push(...rawBulletPoints.map(point => String(point)));
      } else if (typeof rawBulletPoints === 'object' && rawBulletPoints !== null) {
        // Format 2: Object with boolean values - only include keys with true values
        Object.entries(rawBulletPoints).forEach(([key, value]) => {
          if (value === true) {
            bulletPoints.push(key);
          }
        });
      } else {
        // Fallback: convert to string
        bulletPoints.push(String(rawBulletPoints));
      }

      // Only add section if it has bullet points
      if (bulletPoints.length > 0) {
        sections.push({
          title,
          bulletPoints
        });
      }
    });

    return sections;
  }

  // Fallback for any other format
  return [{
    title: 'Explanation',
    bulletPoints: [String(explanation)]
  }];
};
