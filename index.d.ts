/**
 * Given an input node, the Broccoli Funnel plugin returns a new node with only a subset of the files from
 * the input node. The files can be moved to different paths. You can use regular expressions to select
 * which files to include or exclude.
 */
import Plugin from "broccoli-plugin";
import { InputNode } from "broccoli-node-api";

type RelativePathMatcher = (relativePath: string) => boolean;

interface FunnelOptions {
  /**
   * A string representing the portion of the input node to start the funneling from.
   * This will be the base path for any include/exclude regexps.
   *
   * Default: '.', the root path of the input node.
   */
  srcDir?: string;
  /**
   * A string representing the destination path that filtered files will be copied to.
   *
   * Default: '.', the root path of input node.
   */
  destDir?: string;
  /**
   * When using srcDir/destDir options only (aka no filtering via include/exclude options),
   * if the srcDir were missing an error would be thrown. Setting allowEmpty to true,
   * will prevent that error by creating an empty directory at the destination path.
   */
  allowEmpty?: boolean;
  /**
   * One or more matcher expression (regular expression, glob string, or function). Files within the node whose
   * names match this expression will be copied (with the location inside their parent directories preserved) to the destDir.
   *
   * Default: [].
   */
  include?: (string | RegExp | RelativePathMatcher)[];
  /**
   * One or more matcher expression (regular expression, glob string, or function).
   * Files within the node whose names match this expression will not be copied to the destDir if they otherwise would have been.
   *
   * Note, in the case when a file matches both an include and exclude pattern, the exclude pattern wins
   *
   * Default: [].
   */
  exclude?: (string | RegExp | RelativePathMatcher)[];
  /**
   * One or more relative file paths. Files within the node whose relative paths match will be copied
   * (with the location inside their parent directories preserved) to the destDir.
   *
   * Default: [].
   */
  files?: string[];
  /**
   * This method will get called for each file, receiving the currently processing relativePath as its first argument.
   * The value returned from getDestinationPath will be used as the destination for the new node. This is a very
   * simple way to rename files or move them from one path to another (replacing the need for broccoli-file-mover for example).
   *
   * The return value of this method is cached for each input file. This means that getDestinationPath will only
   * be called once per relativePath.
   */
  getDestinationPath?: (relativePath: string) => string;
  /**
   * A descriptive annotation. Useful for debugging, to tell multiple instances of the same plugin apart.
   */
  annotation?: string;
}

/**
 * A Broccoli node (formerly: "tree"). A node in Broccoli can be either a string that references a directory
 * in your project or a node object returned from running another Broccoli plugin.
 */
export default function funnel(inputNode: InputNode, options?: FunnelOptions): Funnel;

export class Funnel extends Plugin {

  constructor(inputNode: InputNode, options?: FunnelOptions);
}