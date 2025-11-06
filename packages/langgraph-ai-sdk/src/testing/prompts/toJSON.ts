import stringify from 'fast-json-stable-stringify';

export const toJSON = (data: Record<string, any>): string => {
  return stringify(data);
};
