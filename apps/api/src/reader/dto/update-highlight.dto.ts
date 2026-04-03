import { IsIn } from 'class-validator';
import { HIGHLIGHT_COLORS } from './constants';

export class UpdateHighlightDto {
  @IsIn(HIGHLIGHT_COLORS, { message: 'color უნდა იყოს: yellow, green, blue, red' })
  color: string;
}
