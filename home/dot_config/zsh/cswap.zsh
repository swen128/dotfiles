#compdef cswap cs

_cswap_accounts() {
  local -a accounts
  accounts=(${(f)"$(command cswap completion-accounts 2>/dev/null)"})
  _describe 'account' accounts
}

_cswap() {
  local context state line
  typeset -A opt_args
  local -a commands

  commands=(
    'add:Add the active Claude account'
    'add-token:Add an account from a token on stdin'
    'list:List managed accounts and usage'
    'status:Show the active account'
    'switch:Switch accounts'
    'auto:Automatically switch near usage limits'
    'remove:Remove a managed account'
    'disable:Exclude an account from rotation'
    'enable:Return an account to rotation'
    'alias:Manage account aliases'
    'move:Move or swap account slots'
    'export:Export account credentials'
    'import:Import account credentials'
    'config:Manage settings'
    'purge:Delete all cswap data'
    'help:Show help'
    'version:Show version'
  )

  _arguments -C \
    '(-h --help)'{-h,--help}'[show help]' \
    '(-v --version)'{-v,--version}'[show version]' \
    '1:command:->command' \
    '*::argument:->arguments'

  case $state in
    command)
      _describe 'command' commands
      ;;
    arguments)
      case $words[2] in
        add)
          _arguments \
            '--slot=[store in a specific slot]:slot:' \
            '--alias=[assign an alias]:alias:' \
            '--force[replace an occupied slot]'
          ;;
        add-token)
          _arguments \
            '1:stdin marker:(-)' \
            '--slot=[store in a specific slot]:slot:' \
            '--email=[account label]:email:' \
            '--force[replace an occupied slot]'
          ;;
        list)
          _arguments '--json[emit JSON]' '--refresh[refresh usage data]'
          ;;
        status)
          _arguments '--json[emit JSON]'
          ;;
        switch)
          _arguments \
            '1:account:_cswap_accounts' \
            '--strategy=[account selection strategy]:strategy:(best next-available)' \
            '--model=[include model-specific weekly limits]:model:' \
            '--force[activate the stored credential even when already active]' \
            '--json[emit JSON]'
          ;;
        auto)
          _arguments \
            '--once[check once and exit]' \
            '--threshold=[switch at this utilization percentage]:percentage:' \
            '--interval=[poll interval in seconds]:seconds:' \
            '--strategy=[account selection strategy]:strategy:(best consume-first)' \
            '--model=[include model-specific weekly limits]:model:' \
            '--dry-run[report without switching]' \
            '--json[emit JSON events]'
          ;;
        remove)
          _arguments '1:account:_cswap_accounts' '--force[allow removing the active account]'
          ;;
        disable|enable)
          _arguments '1:account:_cswap_accounts'
          ;;
        alias)
          _arguments '1:account:_cswap_accounts' '2:alias:' '--unset[remove the alias]'
          ;;
        move)
          _arguments '1:account:_cswap_accounts' '2:target slot:'
          ;;
        export)
          _arguments '1:output file:_files' '--account=[export one account]:account:_cswap_accounts'
          ;;
        import)
          _arguments '1:input file:_files' '--force[replace occupied slots]'
          ;;
        config)
          local -a config_commands settings
          config_commands=('list:List settings' 'get:Get a setting' 'set:Set a setting' 'unset:Reset a setting' 'path:Show the settings file')
          settings=(autoswitch.threshold autoswitch.intervalSeconds autoswitch.cooldownSeconds autoswitch.hysteresisPct autoswitch.strategy autoswitch.model)
          if (( CURRENT == 3 )); then
            _describe 'config command' config_commands
          elif (( CURRENT == 4 )) && [[ $words[2] != list && $words[2] != path ]]; then
            _describe 'setting' settings
          fi
          ;;
        purge)
          _arguments '--force[confirm deletion]'
          ;;
      esac
      ;;
  esac
}

compdef _cswap cswap cs
