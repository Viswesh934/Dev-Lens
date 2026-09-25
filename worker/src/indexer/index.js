// indexer/index.js — Repository indexing module
//
// Transforms a repository (accessed via GitHub API) into structured context
// suitable for storage and later AI analysis.
//
// Architecture:
//   Repository URL
//       ↓
//   GitHub API (REST)
//       ↓
//   Structured Context Object
//       ↓
//   D1 Database

const GITHUB_API = 'https://api.github.com';

/**
 * Index a repository by its GitHub URL.
 * Returns a structured context object.
 *
 * @param {string} url - Repository URL, e.g. https://github.com/owner/repo
 * @param {string|null} githubToken - Optional GitHub token for higher rate limits
 * @returns {Promise<object>} Structured repository context
 */
export async function indexRepository(url, githubToken = null) {
  const { owner, repo } = parseGitHubUrl(url);

  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'DevLens-Indexer/1.0',
  };
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }

  const [repoMeta, readme, tree, commits] = await Promise.all([
    githubFetch(`${GITHUB_API}/repos/${owner}/${repo}`, headers),
    fetchReadme(owner, repo, headers),
    fetchTree(owner, repo, headers),
    fetchRecentCommits(owner, repo, headers),
  ]);

  const languages = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}/languages`, headers);

  const context = buildContext(repoMeta, readme, tree, commits, languages);
  return context;
}

async function githubFetch(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status} for ${url}`);
  }
  return res.json();
}

async function fetchReadme(owner, repo, headers) {
  try {
    const data = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}/readme`, headers);
    // README content is base64-encoded
    const content = atob(data.content.replace(/\n/g, ''));
    // Truncate to first 3000 chars to keep context compact
    return content.slice(0, 3000);
  } catch {
    return null;
  }
}

async function fetchTree(owner, repo, headers) {
  try {
    // Get default branch first
    const repoData = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}`, headers);
    const branch = repoData.default_branch || 'main';
    const treeData = await githubFetch(
      `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      headers
    );
    return treeData.tree || [];
  } catch {
    return [];
  }
}

async function fetchRecentCommits(owner, repo, headers) {
  try {
    const commits = await githubFetch(
      `${GITHUB_API}/repos/${owner}/${repo}/commits?per_page=10`,
      headers
    );
    return commits.map(c => ({
      sha: c.sha.slice(0, 7),
      message: c.commit.message.split('\n')[0],
      author: c.commit.author.name,
      date: c.commit.author.date,
    }));
  } catch {
    return [];
  }
}

function buildContext(repoMeta, readme, tree, commits, languages) {
  const filePaths = tree
    .filter(item => item.type === 'blob')
    .map(item => item.path);

  return {
    name: repoMeta.name,
    url: repoMeta.html_url,
    description: repoMeta.description,
    primary_languages: Object.keys(languages),
    language_bytes: languages,
    stars: repoMeta.stargazers_count,
    default_branch: repoMeta.default_branch,
    topics: repoMeta.topics || [],
    readme_excerpt: readme,
    directory_tree: buildDirectoryTree(filePaths),
    important_files: identifyImportantFiles(filePaths),
    configuration_files: identifyConfigFiles(filePaths),
    dependency_manifests: identifyDependencyManifests(filePaths),
    test_locations: identifyTestFiles(filePaths),
    entry_points: identifyEntryPoints(filePaths),
    total_files: filePaths.length,
    recent_commits: commits,
    git: {
      default_branch: repoMeta.default_branch,
      last_push: repoMeta.pushed_at,
      created_at: repoMeta.created_at,
    },
    indexing_status: 'indexed',
    indexed_at: new Date().toISOString(),
  };
}

function buildDirectoryTree(filePaths) {
  // Build a compact top-level directory listing
  const dirs = new Set();
  filePaths.forEach(p => {
    const parts = p.split('/');
    if (parts.length > 1) {
      dirs.add(parts[0]);
    }
  });
  return Array.from(dirs).sort();
}

function identifyImportantFiles(filePaths) {
  const important = [
    'main.go', 'main.py', 'main.ts', 'main.js', 'index.js', 'index.ts',
    'app.go', 'app.py', 'app.ts', 'app.js', 'server.go', 'server.ts',
    'README.md', 'README.rst', 'ARCHITECTURE.md', 'DESIGN.md',
    'Makefile', 'docker-compose.yml', 'docker-compose.yaml',
    'Dockerfile', '.env.example',
  ];
  return filePaths.filter(p => {
    const filename = p.split('/').pop();
    return important.includes(filename);
  });
}

function identifyConfigFiles(filePaths) {
  const patterns = [
    /\.env\.example$/, /\.env\.sample$/, /wrangler\.toml$/, /tsconfig\.json$/,
    /jest\.config\.[jt]s$/, /vite\.config\.[jt]s$/, /webpack\.config\.js$/,
    /\.eslintrc/, /prettier\.config/, /docker-compose/,
  ];
  return filePaths.filter(p => patterns.some(re => re.test(p)));
}

function identifyDependencyManifests(filePaths) {
  const manifests = [
    'package.json', 'go.mod', 'requirements.txt', 'Pipfile',
    'pyproject.toml', 'Cargo.toml', 'pom.xml', 'build.gradle',
    'composer.json', 'Gemfile',
  ];
  return filePaths.filter(p => {
    const filename = p.split('/').pop();
    return manifests.includes(filename);
  });
}

function identifyTestFiles(filePaths) {
  const testDirs = new Set();
  filePaths.forEach(p => {
    if (
      p.includes('_test.go') || p.includes('.test.ts') ||
      p.includes('.test.js') || p.includes('.spec.ts') ||
      p.includes('.spec.js') || p.includes('/test/') ||
      p.includes('/tests/') || p.includes('/__tests__/')
    ) {
      const dir = p.split('/').slice(0, 2).join('/');
      testDirs.add(dir);
    }
  });
  return Array.from(testDirs);
}

function identifyEntryPoints(filePaths) {
  const entryPatterns = [
    /^main\.go$/, /^main\.py$/, /^main\.[jt]s$/,
    /^src\/index\.[jt]sx?$/, /^src\/main\.[jt]sx?$/,
    /^app\.[jt]s$/, /^server\.[jt]s$/,
    /cmd\/[^/]+\/main\.go$/,
  ];
  return filePaths.filter(p => entryPatterns.some(re => re.test(p)));
}

function parseGitHubUrl(url) {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error(`Invalid GitHub URL: ${url}`);
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}
