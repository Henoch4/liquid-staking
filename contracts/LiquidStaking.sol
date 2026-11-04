// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract ReentrancyGuard {
    bool private _nonReentrant;
    constructor() { _nonReentrant = false; }
    modifier nonReentrant() {
        require(!_nonReentrant, "ReentrancyGuard: reentrant call");
        _nonReentrant = true;
        _;
        _nonReentrant = false;
    }
}
abstract contract Ownable {
    address private _owner;
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    constructor() { _owner = msg.sender; emit OwnershipTransferred(address(0), _owner); }
    modifier onlyOwner() { require(_owner == msg.sender, "Ownable: caller is not the owner"); _; }
    function owner() public view returns (address) { return _owner; }
}

contract LiquidStaking is ReentrancyGuard, Ownable {
    struct Stake {
        address user;
        uint256 amount;
        uint256 stakedAt;
        uint256 shares;
        bool active;
    }
    Stake[] public stakes;
    mapping(address => uint256[]) public userStakes;
    mapping(address => uint256) public stakeShares;
    uint256 public totalStaked;
    uint256 public totalShares;
    uint256 public stakeCount;
    string public constant name="Tidewell Staked BOT";
    string public constant symbol="tBOT";
    uint8 public constant decimals=18;
    mapping(address=>mapping(address=>uint256)) public allowance;
    event Transfer(address indexed from,address indexed to,uint256 shares);
    event Approval(address indexed holder,address indexed spender,uint256 amount);
    event RewardsFunded(uint256 amount);

    event Staked(address indexed user, uint256 amount, uint256 shares);
    event Unstaked(address indexed user, uint256 amount, uint256 shares);

    function stake(uint256 amount) external payable nonReentrant {
        require(amount > 0, "Zero amount");
        require(msg.value == amount, "Incorrect amount");
        uint256 shares = totalShares == 0 ? amount : (amount * totalShares) / totalStaked;
        Stake storage s = stakes.push();
        s.user = msg.sender;
        s.amount = amount;
        s.stakedAt = block.timestamp;
        s.shares = shares;
        s.active = true;
        // FIX: was `stakeShares[msg.sender] = shares` — overwrote the caller's
        // balance on every stake so only the latest stake was refundable and the
        // global share accounting silently broke. Accumulate instead.
        stakeShares[msg.sender] += shares;
        totalStaked += amount;
        totalShares += shares;
        stakeCount += 1;
        userStakes[msg.sender].push(stakes.length - 1);
        emit Staked(msg.sender, amount, shares);
        emit Transfer(address(0),msg.sender,shares);
    }

    function unstake() external nonReentrant {
        uint256 shares = stakeShares[msg.sender];
        require(shares > 0, "No stake");
        uint256 amount = (shares * totalStaked) / totalShares;
        require(amount > 0, "Zero amount");
        // FIX: contract must hold enough native BOT to honor the redemption;
        // fail loudly instead of emitting an event and keeping the funds.
        require(address(this).balance >= amount, "Insufficient vault");
        stakeShares[msg.sender] = 0;
        totalStaked -= amount;
        totalShares -= shares;
        // FIX: unstake previously only emitted an event and KEPT the ETH
        // (one-way lockbox). Now actually pay the redeemer back.
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "ETH transfer failed");
        emit Unstaked(msg.sender, amount, shares);
        emit Transfer(msg.sender,address(0),shares);
    }

    function balanceOf(address who) external view returns(uint256){return stakeShares[who];}
    function totalSupply() external view returns(uint256){return totalShares;}
    function approve(address spender,uint256 amount) external returns(bool){allowance[msg.sender][spender]=amount;emit Approval(msg.sender,spender,amount);return true;}
    function transfer(address to,uint256 amount) external returns(bool){_transfer(msg.sender,to,amount);return true;}
    function transferFrom(address from,address to,uint256 amount) external returns(bool){uint256 permitted=allowance[from][msg.sender];require(permitted>=amount,"Insufficient allowance");if(permitted!=type(uint256).max)allowance[from][msg.sender]=permitted-amount;_transfer(from,to,amount);return true;}
    function _transfer(address from,address to,uint256 amount) private {require(to!=address(0)&&amount>0&&stakeShares[from]>=amount,"Invalid share transfer");stakeShares[from]-=amount;stakeShares[to]+=amount;emit Transfer(from,to,amount);}
    function fundRewards() external payable onlyOwner {require(totalShares>0&&msg.value>0,"No active stake or rewards");totalStaked+=msg.value;emit RewardsFunded(msg.value);}


    function getStake(address user) external view returns (uint256 amount, uint256 shares, bool active) {
        uint256 s = stakeShares[user];
        return (s > 0 ? (s * totalStaked) / totalShares : 0, s, s > 0);
    }
    function getTotalStaked() external view returns (uint256) { return totalStaked; }
}
