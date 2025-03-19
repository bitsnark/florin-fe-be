#!/bin/sh

postgres_container_name="${POSTGRES_CONTAINER_NAME:-postgres}"

# On macOS, "System Integrety Protection" clears the DYLD_FALLBACK_LIBRARY_PATH,
# which leaves the Python executable unable to find the secp256k1 library installed by Homebrew.
DYLD_FALLBACK_LIBRARY_PATH="$DYLD_FALLBACK_LIBRARY_PATH:/usr/local/lib:/opt/homebrew/lib"
export DYLD_FALLBACK_LIBRARY_PATH

if ! (return 0 2>/dev/null); then

    read -p "This script is intended to be sourced, not executed, continue? (y/N): " response
    [ "$response" = y ] || [ "$response" = Y ] || exit 1
    scripts_dir="$(dirname "$(realpath "$0")")"
fi

if [ -z "$INIT_CWD" ]; then
    read -p "This script is intended to be run with npm run-script, continue? (y/N): " response
    [ "$response" = y ] || [ "$response" = Y ] || exit 1
    [ "$scripts_dir" ] || scripts_dir="$(realpath .)"
    repo_root_dir="$(git -C "$scripts_dir" rev-parse --show-toplevel 2> /dev/null)"
    if [ -d "$repo_root_dir" ]; then
        echo "WARNING: Trying to cd to repo root dir: $repo_root_dir"
        cd "$repo_root_dir"
    else
        echo "WARNING: Couldn't find repo root dir, using current dir as root"
    fi
fi

if docker ps > /dev/null 2>&1; then
    docker_cmd=docker
elif sudo docker ps > /dev/null 2>&1; then
    docker_cmd='sudo docker'
else
    echo "Can't run docker commands. Docker daemon may be missing."
    return 1
fi

missing_packages() {
    pip freeze | sort > /tmp/bitsnark_venv_installed
    sort ./python/requirements.txt > /tmp/bitsnark_requirements
    missing_packages="$(comm -23 /tmp/bitsnark_requirements /tmp/bitsnark_venv_installed)"
    rm /tmp/bitsnark_venv_installed /tmp/bitsnark_requirements
    echo "$missing_packages"
}

conditionally_remove_container() {
    local container_name="$1"
    test -z "$($docker_cmd ps -aq -f name=$container_name)" && return 0
    echo "Container $container_name already exists."
    read -p "Do you want to remove the existing container? (y/n): " response
    if [ "$response" = y ] || [ "$response" = Y ]; then
        $docker_cmd rm -f "$container_name" && return 0
    fi
    echo Existing container was not removed - exiting.
    return 1
}
