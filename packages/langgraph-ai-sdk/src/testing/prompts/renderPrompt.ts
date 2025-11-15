import xmlFormat from 'xml-formatter';

export async function renderPrompt(input: string | Promise<string> | (() => string | Promise<string>)): Promise<string> {
  // Get the string content
  let content: string;
  
  if (typeof input === 'string') {
    content = input;
  } else if (typeof input === 'function') {
    content = await input();
  } else if (input && typeof input.then === 'function') {
    content = await input;
  } else {
    throw new Error('renderPrompt expects a string, a promise that returns a string, or a function that returns a string');
  }
  
  // Clean up and format the content
  return formatPromptContent(content);
}

function formatPromptContent(content: string): string {
  // Trim leading/trailing whitespace
  content = content.trim();
  
  // Try to format as XML if it looks like XML
  if (content.includes('<') && content.includes('>')) {
    try {
      // Extract entire <file> elements to preserve their content exactly
      const fileElements = new Map<string, { path: string; content: string }>();
      let fileIndex = 0;
      let processedContent = content.replace(/<file\s+[^>]*>[\s\S]*?<\/file>/g, (match) => {
        // Extract the path attribute
        const pathMatch = match.match(/path="([^"]*)"/);
        const path = pathMatch ? pathMatch[1] : '';
        
        // Extract the content (everything between opening and closing tags)
        const contentMatch = match.match(/<file[^>]*>([\s\S]*?)<\/file>/);
        let fileContent = contentMatch?.[1] ?? '';
        
        // Remove CDATA wrapper if present
        fileContent = fileContent.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1');
        
        // Store the complete file element with proper formatting
        const placeholder = `__FILE_PLACEHOLDER_${fileIndex}__`;
        if (path === undefined) {
          throw new Error('path is undefined');
        }
        fileElements.set(placeholder, { path, content: fileContent });
        fileIndex++;
        return placeholder;
      });
      
      // Extract remaining CDATA sections and replace with placeholders
      const cdataMap = new Map<string, string>();
      let cdataIndex = 0;
      processedContent = processedContent.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (match, cdataContent) => {
        const placeholder = `__CDATA_PLACEHOLDER_${cdataIndex}__`;
        cdataMap.set(placeholder, cdataContent);
        cdataIndex++;
        return placeholder;
      });
      
      // First wrap in root if needed for proper XML parsing
      const hasMultipleRoots = !processedContent.match(/^<([^>\s]+)[^>]*>[\s\S]*<\/\1>$/);
      const toFormat = hasMultipleRoots ? `<root>${processedContent}</root>` : processedContent;
      
      // Format with xml-formatter
      let formatted = xmlFormat(toFormat, {
        indentation: '  ',
        collapseContent: false,
        lineSeparator: '\n',
        whiteSpaceAtEndOfSelfclosingTag: true
      });
      
      // Unwrap if we added a root
      if (hasMultipleRoots) {
        formatted = formatted
          .replace(/^<root>\n?/, '')
          .replace(/\n?<\/root>$/, '')
          .split('\n')
          .map(line => line.startsWith('  ') ? line.substring(2) : line)
          .join('\n');
      }
      
      // Restore CDATA sections
      cdataMap.forEach((cdataContent, placeholder) => {
        formatted = formatted.replace(placeholder, cdataContent);
      });
      
      // Restore file elements with proper formatting
      fileElements.forEach((fileData, placeholder) => {
        // Determine the indentation level based on the placeholder's position
        const placeholderIndex = formatted.indexOf(placeholder);
        if (placeholderIndex === -1) return;
        
        const lineStart = formatted.lastIndexOf('\n', placeholderIndex) + 1;
        const indent = formatted.substring(lineStart, placeholderIndex);
        
        // Format the file element
        let fileElement: string;
        if (fileData.content.trim()) {
          // If content has multiple lines, format with proper indentation
          const contentLines = fileData.content.split('\n');
          if (contentLines.length > 1) {
            const indentedContent = contentLines
              .map((line, i) => {
                if (i === 0) return line;
                return indent + '    ' + line;
              })
              .join('\n');
            fileElement = `<file path="${fileData.path}">\n${indent}    ${indentedContent}\n${indent}  </file>`;
          } else {
            // Single line content - keep it inline
            fileElement = `<file path="${fileData.path}">${fileData.content}</file>`;
          }
        } else {
          // Empty file
          fileElement = `<file path="${fileData.path}"></file>`;
        }
        
        formatted = formatted.replace(placeholder, fileElement);
      });
      
      content = formatted;
    } catch (e) {
      // If XML formatting fails, continue with the content as-is
      console.warn('XML formatting failed, using original content');
    }
  }
  
  // Format any embedded JSON blocks
  content = formatEmbeddedJson(content);
  
  // Add consistent spacing between top-level XML tags for readability
  content = addXmlSpacing(content);
  
  return content;
}

function formatEmbeddedJson(content: string): string {
  // Find JSON blocks (between tags or in specific markers) - both objects and arrays
  const jsonPattern = />(\s*[\[{][\s\S]*?[\]}]\s*)</g;
  
  return content.replace(jsonPattern, (match, json) => {
    try {
      // Parse and pretty-print the JSON
      const parsed = JSON.parse(json);
      const formatted = JSON.stringify(parsed, null, 2);
      
      // Get the indentation level from the surrounding context
      const lines = content.substring(0, content.indexOf(match)).split('\n');
      const lastLine = lines[lines.length - 1] ?? '';
      const indent = lastLine.match(/^(\s*)/)?.[1] ?? '';
      
      // Indent each line of the JSON
      const indentedJson = formatted
        .split('\n')
        .map((line, i) => i === 0 ? line : indent + '  ' + line)
        .join('\n');
      
      return `>\n${indent}  ${indentedJson}\n${indent}<`;
    } catch {
      // Not valid JSON, return as-is
      return match;
    }
  });
}

function addXmlSpacing(content: string): string {
  const lines = content.split('\n');
  const spacedLines: string[] = [];
  let previousWasClosingTag = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const trimmedLine = line.trim();
    const isTopLevel = !line.startsWith('  ');
    const isOpeningTag = /^<[^\/]/.test(trimmedLine);
    const isClosingTag = /^<\//.test(trimmedLine);
    
    // Add spacing between top-level closing and opening tags
    if (isTopLevel && isOpeningTag && previousWasClosingTag && spacedLines.length > 0) {
      spacedLines.push('');
    }
    
    spacedLines.push(line);
    previousWasClosingTag = isTopLevel && isClosingTag;
  }
  
  return spacedLines.join('\n');
}