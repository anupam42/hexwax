const { build } = require('esbuild');
const hexwax = require('hexwax');
const fsp = require('fs/promises');
const fs = require('fs');
const path = require('path');

process.argv.includes('-w') ? process.env.WATCH = 1 : null;

// Configs 

const esbuildConfigPath = path.join(process.cwd(),'esbuild.config.js');
const derverConfigPath = path.join(process.cwd(),'derver.config.js');

const esbuildConfig = fs.existsSync(esbuildConfigPath) ? require(esbuildConfigPath) : {};
const derverConfig = fs.existsSync(derverConfigPath) ? require(derverConfigPath) : {};

// Executable

if(!module.parent){

    if(process.env.WATCH){
        const { derver } = require('derver');
        esbuild({
            minify: false,
            incremental: true
        }).then( bundle =>{
            derver({
                dir: 'public',
                watch: ['public','src'],
                onwatch: async (lr,item)=>{
                    if(item === 'src'){
                        lr.prevent();
                        try{
                            await bundle.rebuild();
                        }catch(err){
                            console.log(err.message);
                            lr.error(err.toString(),'Build error');
                        }
                    }
                },
                ...derverConfig
            })
        })
    }else{
        esbuild();
    }
    
}

// Module

module.exports = {
    hexwaxPlugin,
    esbuild
}

function hexwaxPlugin(options={}){

    const cssModules = new Map();

    if(options.displayVersion !== false) console.log('! Hexwax', hexwax.version);

    return {
        name: 'hexwax-plugin',
        setup(build) {
            build.onResolve({ filter: /^hexwax$/ }, async (args) => {
                const runtime = await build.resolve('hexwax/runtime.js', {resolveDir: args.resolveDir, kind: args.kind});
                return {
                    path: runtime.path,
                    sideEffects: false
                };
            });

            build.onResolve({ filter: /\.(xht|ma|html)$/ }, (arg) => {
                return {
                    path: path.resolve(arg.resolveDir,arg.path),
                    sideEffects: false
                }
            });

            build.onLoad(
                { filter: /\.(xht|ma|html)$/ }, 
                async (args) => {

                    let source = await fsp.readFile(args.path, 'utf8');

                    let ctx = await hexwax.compile(source,{
                        path: args.path,
                        name: args.path.match(/([^/\\]+)\.\w+$/)[1],
                        ...options
                    });

                    let code = ctx.result;
                    
                    if(ctx.css.result){
                        const cssPath = args.path.replace(/\.\w+$/, ".hexwax.css").replace(/\\/g, "/");
                        cssModules.set(cssPath,ctx.css.result);
                        code += `\nimport "${cssPath}";`
                    }
                    
                    return { contents: code }
                }
            );

            build.onResolve({ filter: /\.hexwax\.css$/ }, ({ path }) => {
                return { path, namespace: 'hexwaxcss' }
            })

            build.onLoad({ filter: /\.hexwax\.css$/, namespace: 'hexwaxcss' }, ({ path }) => {
                const css = cssModules.get(path);
                return css ? { contents: css, loader: "css" } : null;
            })
        }
    }
}

async function esbuild(options={}){

    options = {
        entryPoints: ['src/main.js'],
        outfile: 'public/bundle.js',
        minify: true,
        bundle: true,
        plugins: [hexwaxPlugin()],
        ...esbuildConfig,
        ...options
    };

    return build(options);
}
