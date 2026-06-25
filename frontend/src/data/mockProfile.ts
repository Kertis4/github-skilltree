/**
 * Mock user profile data for development and testing.
 * Simulates the GET /me/profile API response.
 * 
 * This hardcoded data allows the visualization components to render
 * during development before the backend API is ready.
 * Replace with real API calls on Day 3.
 */

import type { UserProfile } from '@/types/api';

export const mockProfile: UserProfile = {
  user: 'octocat',
  totalXp: 4200,
  radar: {
    Languages: 80,
    Paradigms: 55,
    Tooling: 40,
    Quality: 60,
  },
  skills: [
    {
      id: 'csharp',
      name: 'C#',
      category: 'Languages',
      xp: 1200,
      level: 5,
      parent_id: null,
      evidence: [
        'ConsoleApp/Program.cs: Main() orchestration',
        'Models/User.cs: 300+ LOC',
      ],
      description: 'Deep expertise with C# for enterprise applications',
    },
    {
      id: 'linq',
      name: 'LINQ / Idiomatic C#',
      category: 'Languages',
      xp: 900,
      level: 4,
      parent_id: 'csharp',
      evidence: [
        'src/Query.cs: .Where(...).Select(...).OrderBy(...)',
        'Services/DataProcessor.cs: 15+ LINQ chains',
      ],
      description: 'Fluent API and expression trees mastery',
    },
    {
      id: 'python',
      name: 'Python',
      category: 'Languages',
      xp: 850,
      level: 4,
      parent_id: null,
      evidence: [
        'scripts/etl_pipeline.py: 500 LOC',
        'tests/fixtures.py: pytest fixtures',
      ],
      description: 'Solid Python foundation for scripting and data work',
    },
    {
      id: 'comprehensions',
      name: 'Comprehensions / Generators',
      category: 'Languages',
      xp: 500,
      level: 3,
      parent_id: 'python',
      evidence: ['utils/transforms.py: [x**2 for x in range(n)]'],
      description: 'Pythonic idioms for concise data manipulation',
    },
    {
      id: 'oop',
      name: 'OOP',
      category: 'Paradigms',
      xp: 1100,
      level: 5,
      parent_id: null,
      evidence: [
        'Models/: 8 classes with inheritance',
        'Design patterns: Factory, Strategy, Observer',
      ],
      description: 'Expert in object-oriented design principles',
    },
    {
      id: 'functional',
      name: 'Functional Programming',
      category: 'Paradigms',
      xp: 650,
      level: 3,
      parent_id: null,
      evidence: [
        'src/FunctionalUtils.cs: Pure functions, immutability',
        'scripts/map_filter.py: Function composition',
      ],
      description: 'Growing comfort with functional paradigms',
    },
    {
      id: 'async',
      name: 'Async / Concurrency',
      category: 'Paradigms',
      xp: 800,
      level: 4,
      parent_id: null,
      evidence: [
        'Services/ApiClient.cs: async/await patterns',
        'tasks/worker.py: asyncio event loops',
      ],
      description: 'Strong async/await and concurrency foundations',
    },
    {
      id: 'docker',
      name: 'Docker',
      category: 'Tooling & DevOps',
      xp: 700,
      level: 3,
      parent_id: null,
      evidence: [
        'Dockerfile: Multi-stage build',
        '.dockerignore: Optimized layers',
      ],
      description: 'Containerization with Docker',
    },
    {
      id: 'compose',
      name: 'docker-compose',
      category: 'Tooling & DevOps',
      xp: 450,
      level: 2,
      parent_id: 'docker',
      evidence: ['docker-compose.yml: 3 services, networks defined'],
      description: 'Local multi-container orchestration',
    },
    {
      id: 'ci-cd',
      name: 'CI / CD',
      category: 'Tooling & DevOps',
      xp: 600,
      level: 3,
      parent_id: null,
      evidence: [
        '.github/workflows/: 4 action files',
        'azure-pipelines.yml: Deploy stages',
      ],
      description: 'GitHub Actions, Azure Pipelines automation',
    },
    {
      id: 'iac',
      name: 'IaC (Terraform / Bicep)',
      category: 'Tooling & DevOps',
      xp: 550,
      level: 3,
      parent_id: null,
      evidence: [
        'infra/main.tf: 200+ lines',
        'azure/bicep/: App Service + Cosmos DB',
      ],
      description: 'Infrastructure as Code with Terraform and Azure Bicep',
    },
    {
      id: 'testing',
      name: 'Testing',
      category: 'Code Quality',
      xp: 900,
      level: 4,
      parent_id: null,
      evidence: [
        'tests/: 45 unit tests',
        'coverage/: 82% code coverage',
      ],
      description: 'Comprehensive unit and integration testing',
    },
    {
      id: 'coverage',
      name: 'Coverage / Mocking',
      category: 'Code Quality',
      xp: 600,
      level: 3,
      parent_id: 'testing',
      evidence: [
        'tests/mocks/: Mock factories',
        'xUnit fixtures: SetupAsync patterns',
      ],
      description: 'Advanced mocking and coverage analysis',
    },
    {
      id: 'types',
      name: 'Static Typing',
      category: 'Code Quality',
      xp: 850,
      level: 4,
      parent_id: null,
      evidence: [
        'tsconfig: strict mode enabled',
        'src/: Full TypeScript coverage',
      ],
      description: 'Strong static type system expertise',
    },
  ],
  quests: [
    {
      skill: 'functional',
      type: 'expand',
      title: 'Go Functional in C#',
      description:
        "You're strong in OOP and async. Functional paradigms will give you a fresh perspective on problem-solving.",
      steps: [
        'Refactor one LINQ chain using pure functions (no side effects)',
        'Explore immutable data structures (Immutable.Collections)',
        'Read about monads and LINQ as a monad comprehension',
      ],
      resources: [
        'https://learn.microsoft.com/en-us/dotnet/csharp/linq/',
        'https://github.com/louthy/language-ext',
      ],
    },
    {
      skill: 'docker',
      type: 'deepen',
      title: 'Docker Mastery: Optimization & Security',
      description:
        "You're solid with Docker basics. Time to optimize image size and harden security.",
      steps: [
        'Reduce your Dockerfile image size by 50% (use distroless base)',
        'Implement Docker security scanning (Trivy, Snyk)',
        'Set up multi-stage builds for dev/test/prod',
      ],
      resources: [
        'https://docs.docker.com/develop/dev-best-practices/',
        'https://github.com/aquasecurity/trivy',
      ],
    },
  ],
};

/**
 * Alternative profile for testing a different skill distribution.
 */
export const mockProfileAlt: UserProfile = {
  user: 'pythonista',
  totalXp: 3500,
  radar: {
    Languages: 90,
    Paradigms: 70,
    Tooling: 35,
    Quality: 50,
  },
  skills: [
    {
      id: 'python',
      name: 'Python',
      category: 'Languages',
      xp: 1500,
      level: 6,
      parent_id: null,
      evidence: ['scripts/: 1000+ LOC'],
    },
    {
      id: 'oop',
      name: 'OOP',
      category: 'Paradigms',
      xp: 900,
      level: 4,
      parent_id: null,
      evidence: ['classes/: dataclasses + inheritance'],
    },
  ],
};
