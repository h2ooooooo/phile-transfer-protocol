<?php

$rootPath = __DIR__ . '/../playground'; // Root directory for the playground

class PlaygroundStructureCreator {
    /**
     * @param string $message
     *
     * @return void
     */
    private function log(string $message): void {
        printf('%s | %s' . PHP_EOL, date('H:i:s'), $message);
    }

    /**
     * @param string $extension
     *
     * @return string
     *
     * @throws Exception
     */
    public function getPlaygroundFilePath($extension) {
        $extension = strtolower($extension);

        $path = __DIR__ . '/../playground-files/file.' . $extension;

        if (!file_exists($path)) {
            throw new \Exception(sprintf('Could not find playground file with extension %s at %s', $extension, $path));
        }

        return realpath($path);
    }

    /**
     * Creates a directory structure based on the provided configuration file.
     *
     * @param string $configPath The path to the configuration file.
     *
     * @return void
     */
    public function createStructureFromConfig(string $configPath): void {
        if (!is_readable($configPath)) {
            throw new \Exception(sprintf('Could not read config at %s', $configPath));
        }

        $this->log(sprintf('Reading playground structure from config %s', $configPath));

        $config = json_decode(file_get_contents($configPath), true);

        if (empty($config)) {
            throw new \Exception('Could not parse config');
        }

        if (empty($config['rootPath'])) {
            throw new \Exception(sprintf('Config rootPath is empty'));
        }

        $rootPath = __DIR__ . '/../' . $config['rootPath']; // Root directory for the playground

        $this->log(sprintf('Root path: %s', $rootPath));

        if (file_exists($rootPath)) {
            $this->log(sprintf('Removing existing directory %s..', $rootPath));

            $this->removeDirectory($rootPath);
        }

        $this->log('Creating directory');
        mkdir($rootPath, 0777, true);

        $rootPath = realpath($rootPath);
        $this->log(sprintf('Real root path: %s', $rootPath));

        $this->log(sprintf('Generating directory structure at %s..', $rootPath));
        $this->createDirectoryStructure($config['randomStructure'], $rootPath);

        $this->log('Done generating directory structure!');
    }

    /**
     * Creates the directory structure based on the provided array of directories.
     *
     * @param array $directories The array of directories to create. Each directory should be represented by an associative array with the following keys:
     *                           - name: The name of the directory*/
    private function createDirectoryStructure(array $directories, string $basePath) {
        foreach ($directories as $dir) {
            $dirPath = $basePath . '/' . $dir['name'];

            if (!file_exists($dirPath)) {
                mkdir($dirPath, 0777, true);
            }

            foreach ($dir['files'] as $file) {
                $this->createFile($dirPath . '/' . $file);
            }

            if (!empty($dir['directories'])) {
                $this->createDirectoryStructure($dir['directories'], $dirPath);
            }
        }
    }

    /**
     * Creates a file with the given file path and fills it with content.
     *
     * @param string $filePath The path of the file to be created.
     *
     * @return void
     *
     * @throws \Exception
     */
    private function createFile(string $filePath) {
        $extension = pathinfo($filePath, PATHINFO_EXTENSION);

        $playgroundFile = $this->getPlaygroundFilePath($extension);

        file_put_contents($filePath, file_get_contents($playgroundFile));
    }

    /**
     * Removes a directory and its contents recursively.
     *
     * @param string $path The path of the directory to be removed.
     *
     * @return bool Returns true on success and false on failure.
     */
    private function removeDirectory(string $path) {
        $files = array_diff(scandir($path), array('.', '..'));

        foreach ($files as $file) {
            $filePath = "$path/$file";

            if (is_dir($filePath)) {
                $this->removeDirectory($filePath);
            } else {
                unlink($filePath);
            }
        }

        return rmdir($path);
    }
}

$structureCreator = new PlaygroundStructureCreator();
$structureCreator->createStructureFromConfig(__DIR__ . '/../fixtures/playground-structure-config.json');
