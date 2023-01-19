import fs from 'fs'
import path from 'path'
import type webpack from 'webpack'
import type { NextConfig } from 'next'

import { parseFile, getDefaultExport, hasStaticName, hasHOC } from './utils'
import { LoaderOptions } from './types'
import type { NextI18nConfig, I18nConfig } from 'next-translate'

export default function nextTranslate(nextConfig: NextConfig = {}): NextConfig {
  const test = /\.(tsx|ts|js|mjs|jsx)$/
  const basePath = pkgDir()

  // https://github.com/blitz-js/blitz/blob/canary/nextjs/packages/next/build/utils.ts#L54-L59
  const possiblePageDirs = [
    'pages',
    'src/pages',
    'app/pages',
    'integrations/pages',
  ] as const

  // NEXT_TRANSLATE_PATH env is supported both relative and absolute path
  const translationDir = path.resolve(
    path.relative(basePath, process.env.NEXT_TRANSLATE_PATH || '.')
  )

  const nextConfigI18n: NextI18nConfig = nextConfig.i18n || {}
  let {
    locales = nextConfigI18n.locales || [],
    defaultLocale = nextConfigI18n.defaultLocale || 'en',
    domains = nextConfigI18n.domains,
    localeDetection = nextConfigI18n.localeDetection,
    loader = true,
    pagesInDir,
    ...restI18n
  } = require(path.join(translationDir, 'i18n')) as I18nConfig

  const nextConfigWithI18n: NextConfig = {
    ...nextConfig,
    i18n: {
      locales,
      defaultLocale,
      domains,
      localeDetection,
    },
  }

  let hasGetInitialPropsOnAppJs = false

  if (!pagesInDir) {
    for (const possiblePageDir of possiblePageDirs) {
      if (fs.existsSync(path.join(basePath, possiblePageDir))) {
        pagesInDir = possiblePageDir
        break
      }
    }
  }

  if (!pagesInDir || !fs.existsSync(path.join(basePath, pagesInDir))) {
    // Pages folder not found, so we're not using the loader
    return nextConfigWithI18n
  }

  const pagesPath = path.join(basePath, pagesInDir)
  const app = fs.readdirSync(pagesPath).find((page) => page.startsWith('_app.'))

  if (app) {
    const appPkg = parseFile(basePath, path.join(pagesPath, app))
    const defaultExport = getDefaultExport(appPkg)

    if (defaultExport) {
      const isGetInitialProps = hasStaticName(
        appPkg,
        defaultExport,
        'getInitialProps'
      )
      hasGetInitialPropsOnAppJs = isGetInitialProps || hasHOC(appPkg)
    }
  }

  return {
    ...nextConfigWithI18n,
    webpack(conf: webpack.Configuration, options) {
      const config: webpack.Configuration =
        typeof nextConfig.webpack === 'function'
          ? nextConfig.webpack(conf, options)
          : conf

      // Creating some "slots" if they don't exist
      if (!config.resolve) config.resolve = {}
      if (!config.module) config.module = {}
      if (!config.module.rules) config.module.rules = []

      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        '@next-translate-root': path.resolve(translationDir),
      }

      // we give the opportunity for people to use next-translate without altering
      // any document, allowing them to manually add the necessary helpers on each
      // page to load the namespaces.
      if (!loader) return config

      config.module.rules.push({
        test,
        use: {
          loader: 'next-translate/plugin/loader',
          options: {
            basePath,
            pagesPath: path.join(pagesPath, '/'),
            hasAppJs: Boolean(app),
            hasGetInitialPropsOnAppJs,
            hasLoadLocaleFrom: typeof restI18n.loadLocaleFrom === 'function',
            extensionsRgx: restI18n.extensionsRgx || test,
            revalidate: restI18n.revalidate || 0,
          } as LoaderOptions,
        },
      })

      return config
    },
  }
}

function pkgDir() {
  try {
    return (require('pkg-dir').sync() as string) || process.cwd()
  } catch (e) {
    return process.cwd()
  }
}