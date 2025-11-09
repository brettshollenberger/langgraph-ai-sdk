import { writeFile } from 'fs/promises';

export async function wipeJSON(filePath: string = './brainstorm-answers.json'): Promise<void> {
  try {
    await writeFile(filePath, '{}', 'utf-8');
  } catch (error) {
  }
}
